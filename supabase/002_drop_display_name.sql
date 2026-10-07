-- 002: LINE の表示名を保存しない方針に変更（2026-10-07 桒野決定）
-- 既に入っている表示名ごと列を削除する。SQL Editor に貼って Run する
alter table public.survey_responses drop column if exists display_name;
