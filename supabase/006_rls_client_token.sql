-- 006: 行レベルセキュリティを「自分の合言葉の行だけ読める・更新できる」に変更（2026-10-07）
-- 背景: 条件付きの UPDATE は対象行が「読める」必要があり、SELECT を許可していなかったため更新が全て空振りしていた。
-- 画面はリクエストヘッダー x-client-token に合言葉を載せる。他人の行は読めない・更新できない。

drop policy if exists "anon can update own response" on public.survey_responses;
drop policy if exists "anon can select own response" on public.survey_responses;

create policy "anon can select own response" on public.survey_responses
  for select to anon
  using (client_token::text = (current_setting('request.headers', true)::json ->> 'x-client-token'));

create policy "anon can update own response" on public.survey_responses
  for update to anon
  using (client_token::text = (current_setting('request.headers', true)::json ->> 'x-client-token'))
  with check (client_token::text = (current_setting('request.headers', true)::json ->> 'x-client-token'));

-- insert は従来通り（誰でも作れる。合言葉は作った本人しか知らない）

-- 更新が空振りした空行（答えなし）を消す
delete from public.survey_responses where status = 'opened' and q1_overall is null;
