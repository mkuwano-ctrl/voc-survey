-- 009: 008 を実行済みのプロジェクト向け。ダッシュボードから店舗を追加できるようにする
drop policy if exists "authenticated can insert store settings" on public.store_settings;
create policy "authenticated can insert store settings" on public.store_settings
  for insert to authenticated with check (true);
