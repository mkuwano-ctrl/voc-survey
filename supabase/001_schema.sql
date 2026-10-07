-- VOC アンケート スキーマ v0（2026-10-07）
-- Supabase ダッシュボード → SQL Editor にそのまま貼って Run する
-- 回答画面は anon key で「挿入」と「自分の行の更新」だけ行う。読み出しは anon に許可しない（集計はダッシュボード/サービスキーで行う）

create extension if not exists pgcrypto;

-- 回答（1来店×1人につき最大1行。画面を開いた時点で行を作り、1問ごとに更新する）
create table if not exists public.survey_responses (
  response_id     uuid primary key,
  client_token    uuid not null,                 -- 回答画面が自分の行を更新するための合言葉（本番は Edge Function で ID トークン検証に置き換える）
  visit_id        text,                          -- 来店ID（配信URLの ?v=）
  send_id         text,                          -- 配信ID（配信URLの ?send=）
  store_id        text not null default 'default',
  line_user_id    text,                          -- LIFF で取得した UID（表示名などのプロフィールは取得・保存しない）
  status          text not null default 'opened', -- opened / started / in_progress / completed
  last_step       text,
  q1_overall      smallint check (q1_overall between 0 and 10),
  q2_revisit      smallint check (q2_revisit between 0 and 10),
  q3_issues       text[] not null default '{}',
  q3_detail       jsonb not null default '{}'::jsonb,   -- {"接客": "会計", "料理の味": "味付け"} のように領域→詳細
  comment         text,
  staff_name      text,
  source_channel  text,
  uid_match       boolean,                       -- visits と突合して後から埋める（null=未判定）
  is_dev          boolean not null default false,
  liff_opened_at  timestamptz,
  answered_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists survey_responses_store_created_idx on public.survey_responses (store_id, created_at desc);
create index if not exists survey_responses_visit_idx on public.survey_responses (visit_id);
create index if not exists survey_responses_uid_idx on public.survey_responses (line_user_id);
-- 同じ人×同じ来店は1行（画面側は「来店ID|UID」から決定的な response_id を作り主キーで upsert する。索引は保険）
create unique index if not exists survey_responses_visit_uid_uniq
  on public.survey_responses (visit_id, line_user_id);

-- 来店（配信対象の元。依頼C の経路から日次で入れる。Phase 1 は手動 CSV 取り込みで可）
create table if not exists public.visits (
  id                uuid primary key default gen_random_uuid(),
  visit_id          text not null,
  line_user_id      text,                        -- ゲストは null
  store_id          text not null,
  visited_at        timestamptz not null,
  table_session_id  text,
  is_guest          boolean not null default false,
  created_at        timestamptz not null default now()
);
-- 同じ来店×同じ人は1行（ゲストは line_user_id が null なので空文字に寄せて一意にする）
create unique index if not exists visits_visit_uid_uniq on public.visits (visit_id, coalesce(line_user_id, ''));

-- 配信（1来店×1人につき1行。ホールドアウトもここに残す）
create table if not exists public.survey_sends (
  send_id         uuid primary key default gen_random_uuid(),
  visit_id        text not null,
  line_user_id    text not null,
  store_id        text not null,
  holdout_group   text not null check (holdout_group in ('send','hold')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  status          text not null default 'planned', -- planned / sent / failed / skipped / hold
  line_message_id text,
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists survey_sends_store_sched_idx on public.survey_sends (store_id, scheduled_at desc);

-- 行レベルセキュリティ: anon は survey_responses に insert と「自分の行の update」だけ。select は不可
alter table public.survey_responses enable row level security;
alter table public.visits enable row level security;
alter table public.survey_sends enable row level security;

drop policy if exists "anon can insert response" on public.survey_responses;
create policy "anon can insert response" on public.survey_responses
  for insert to anon with check (true);

-- update は response_id と client_token の両方が一致する行だけ（WHERE 句で絞る前提。uuid は推測不能）
drop policy if exists "anon can update own response" on public.survey_responses;
create policy "anon can update own response" on public.survey_responses
  for update to anon using (true) with check (true);

-- visits / survey_sends は anon から一切触れない（ポリシーなし＝拒否）

-- 週次集計ビュー（ダッシュボードで見る用。anon には公開しない）
create or replace view public.store_health_weekly as
select
  store_id,
  date_trunc('week', coalesce(answered_at, created_at))::date as week,
  count(*) filter (where status = 'completed') as n_completed,
  count(*) filter (where status in ('started','in_progress','completed')) as n_started,
  count(*) as n_opened,
  round(avg(q1_overall) filter (where status = 'completed'), 2) as avg_overall,
  round(avg(q2_revisit) filter (where status = 'completed'), 2) as avg_revisit,
  count(*) filter (where status = 'completed' and not ('特になし' = any(q3_issues))) as n_with_issue
from public.survey_responses
where not is_dev
group by 1, 2
order by 1, 2 desc;
