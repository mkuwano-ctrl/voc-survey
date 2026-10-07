-- 004: 同じ人×同じ来店の回答を1行にまとめる（2026-10-07）
-- 1) 既存の重複行（答えが入っていない空行）を消す
delete from public.survey_responses r
using public.survey_responses newer
where r.visit_id is not null and r.line_user_id is not null
  and newer.visit_id = r.visit_id and newer.line_user_id = r.line_user_id
  and newer.response_id <> r.response_id
  and (
    -- 答えが入っている行を残す。両方空なら新しい方を残す
    (newer.status = 'completed' and r.status <> 'completed')
    or (newer.status = r.status and newer.created_at > r.created_at)
    or (newer.status in ('started','in_progress') and r.status = 'opened')
  );

-- 2) 以後は同じ組み合わせを1行に制限（画面側は upsert で同じ行を更新する）
create unique index if not exists survey_responses_visit_uid_uniq
  on public.survey_responses (visit_id, line_user_id)
  where visit_id is not null and line_user_id is not null;
