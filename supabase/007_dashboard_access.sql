-- 007: ダッシュボード用のアクセス権（2026-10-07）
-- ログインした人（authenticated）は回答・配信・来店を読める。anon は従来通り自分の合言葉の行だけ。
-- ユーザーは Supabase ダッシュボード → Authentication → Users → "Add user" で作る（自己登録は使わない）。

-- 集計ビューが anon に見えていた穴を塞ぐ（集計値のみだが念のため）
revoke all on public.store_health_weekly from anon;
grant select on public.store_health_weekly to authenticated;

drop policy if exists "authenticated can read responses" on public.survey_responses;
create policy "authenticated can read responses" on public.survey_responses
  for select to authenticated using (true);

drop policy if exists "authenticated can read sends" on public.survey_sends;
create policy "authenticated can read sends" on public.survey_sends
  for select to authenticated using (true);

drop policy if exists "authenticated can read visits" on public.visits;
create policy "authenticated can read visits" on public.visits
  for select to authenticated using (true);

-- 将来、店舗ユーザーに自店だけ見せる場合は dashboard_users(user_id, store_id) を作り、
-- 上の using (true) を using (store_id in (select store_id from dashboard_users where user_id = auth.uid())) に変える
