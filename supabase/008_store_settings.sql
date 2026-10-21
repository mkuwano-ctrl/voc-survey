-- 008: 店舗ごとの配信設定（2026-10-21）
-- 店舗単位でアンケート配信の ON/OFF・ホールドアウト比率・配信時刻を持つ。
-- 配信スクリプトは survey_enabled = false の店舗には送らず、status = 'skipped' で記録する。
-- 将来: Agent Pack の「打って良いか」判定（Marketing 配信 ON/OFF）も同じ表で持つ。

create table if not exists public.store_settings (
  store_id         text primary key,
  store_name       text not null,
  brand            text,                                  -- ブランド（公式アカウントの単位）。複数ブランド時にトークンを切り替える鍵
  survey_enabled   boolean not null default true,         -- 翌日アンケートを送るか
  holdout_percent  integer not null default 10 check (holdout_percent between 0 and 50),
  send_hour_jst    integer not null default 12 check (send_hour_jst between 0 and 23),
  marketing_enabled boolean not null default false,       -- 将来: 再来店販促（LINE）を打って良いか。VOC＋運営指標のゲート結果を人が反映する
  note             text,
  updated_at       timestamptz not null default now()
);

alter table public.store_settings enable row level security;

-- ログインした人は読める・更新できる（ダッシュボードのスイッチ用）。anon は触れない
drop policy if exists "authenticated can read store settings" on public.store_settings;
create policy "authenticated can read store settings" on public.store_settings
  for select to authenticated using (true);
drop policy if exists "authenticated can update store settings" on public.store_settings;
create policy "authenticated can update store settings" on public.store_settings
  for update to authenticated using (true) with check (true);

-- 検証用の初期値
insert into public.store_settings (store_id, store_name, brand, survey_enabled)
values ('meguro', 'たこ焼きや 目黒店', 'takoyakiya', true)
on conflict (store_id) do nothing;
