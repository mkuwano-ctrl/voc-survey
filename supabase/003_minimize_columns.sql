-- 003: データ最小化（2026-10-07 個人情報保護チェック §3）
-- 端末情報（ユーザーエージェント）と会計金額は保存しない。SQL Editor に貼って Run する
alter table public.survey_responses drop column if exists user_agent;
alter table public.visits drop column if exists order_total;
