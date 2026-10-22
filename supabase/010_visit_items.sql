-- 010: 来店ごとの注文商品と、商品別の評価（2026-10-22）
-- 回答画面は「自分の来店の商品」だけを関数経由で取得する（表そのものは anon から読めない）。

-- 来店ごとの注文商品（配信スクリプトが対象者CSVから入れる）
create table if not exists public.visit_items (
  id          uuid primary key default gen_random_uuid(),
  visit_id    text not null,
  store_id    text not null,
  item_name   text not null,
  qty         integer not null default 1,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists visit_items_visit_idx on public.visit_items (visit_id);
alter table public.visit_items enable row level security;
drop policy if exists "authenticated can read visit items" on public.visit_items;
create policy "authenticated can read visit items" on public.visit_items
  for select to authenticated using (true);
-- anon にはポリシーなし（直接は読めない）

-- 回答に商品別の評価を持つ
alter table public.survey_responses add column if not exists q_items_good text[] not null default '{}';
alter table public.survey_responses add column if not exists q_items_bad  text[] not null default '{}';

-- 回答画面用: 来店IDと合言葉が一致する回答行がある場合だけ、その来店の商品名を返す
create or replace function public.get_visit_items(p_visit_id text, p_token uuid)
returns table (item_name text, qty integer)
language sql
security definer
set search_path = public
stable
as $$
  select vi.item_name, vi.qty
  from public.visit_items vi
  where vi.visit_id = p_visit_id
    and exists (
      select 1 from public.survey_responses r
      where r.visit_id = p_visit_id and r.client_token = p_token
    )
  order by vi.sort_order, vi.item_name;
$$;
revoke all on function public.get_visit_items(text, uuid) from public;
grant execute on function public.get_visit_items(text, uuid) to anon, authenticated;

-- 商品別の評価ビュー（ダッシュボード用）
create or replace view public.item_feedback as
select store_id, item, sum(good) as good_count, sum(bad) as bad_count
from (
  select store_id, unnest(q_items_good) as item, 1 as good, 0 as bad from public.survey_responses where status = 'completed' and not is_dev
  union all
  select store_id, unnest(q_items_bad)  as item, 0 as good, 1 as bad from public.survey_responses where status = 'completed' and not is_dev
) t
group by store_id, item;
revoke all on public.item_feedback from anon;
grant select on public.item_feedback to authenticated;
