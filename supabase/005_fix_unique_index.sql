-- 005: 条件付きの一意索引を、条件なしの一意索引に置き換える（2026-10-07）
-- 画面側は「来店ID|UID」から決定的に response_id を作り主キーで upsert するので、この索引は保険。
-- Postgres の一意索引は NULL 同士を重複とみなさないので、ゲスト（UIDなし）行は制限されない。
drop index if exists public.survey_responses_visit_uid_uniq;
create unique index if not exists survey_responses_visit_uid_uniq
  on public.survey_responses (visit_id, line_user_id);

-- 答えが入らず残った test004 の空行を消す（status が opened のまま更新に失敗した行）
delete from public.survey_responses where visit_id = 'test004' and status = 'opened';
