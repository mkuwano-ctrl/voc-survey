# 配信ツール（手動運用・10月の検証用）

`send_survey.py` は、対象者リスト（CSV）を読んで LINE 公式アカウントからアンケート案内を1通ずつ送り、結果を Supabase の `survey_sends` に記録する。Python 3 だけで動く（追加インストール不要）。

## 1. 秘密情報の置き場所（最初に1回）

自分のMacのホームに `~/.voc.env` を作り、次を書く。**このファイルは git に入れない・人に送らない。**

```
export LINE_CHANNEL_ACCESS_TOKEN="（Messaging API チャネルの長期トークン）"
export SUPABASE_URL="https://llhdhcrwgwhpznrrzqfz.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="（Supabase → Project Settings → API → service_role）"
```

使うときはターミナルで先に読み込む:

```
source ~/.voc.env
```

## 2. 自分宛てにテスト送信

自分の UID は Supabase の `survey_responses` の `line_user_id`（`U` で始まる33文字）で分かる。

```
cd voc-survey/tools
python3 send_survey.py --test-to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --store meguro
```

LINE にカードが届き、「アンケートに答える」で回答画面が開けばOK。テスト送信は Supabase に記録しない。

## 3. 本番（翌日12:00の手動運用）

1. 前日の来店者リストを CSV で用意する（列: `line_user_id`, `visit_id`, `store_id`）。依頼C の経路から出す
2. 割当だけ確認:
   ```
   python3 send_survey.py --csv targets_2026-10-26.csv --dry-run
   ```
3. 12:00 に送信:
   ```
   python3 send_survey.py --csv targets_2026-10-26.csv
   ```
4. 結果は画面に出る（送信／ホールドアウト／失敗の件数）。`survey_sends` にも1行ずつ入る

ホールドアウトは「来店ID＋UID」から決定的に決まる（同じ組なら何度実行しても同じ割当）。10%は送らず `hold` として記録する。

## 4. 配信の文面を変えたいとき

`send_survey.py` の `build_message()` を直す。画像カードにしたい場合は Flex の `hero` に画像URL（HTTPS、GitHub Pages に置ける）を足す。
