#!/usr/bin/env python3
"""
VOC アンケート 配信スクリプト（手動運用用・v0）

やること:
  1. 対象者リスト（CSV: line_user_id, visit_id, store_id）を読む
  2. 来店ID×UID から決定的にホールドアウト（10%）を割り当てる
  3. 送る群には LINE Messaging API（Push）でアンケートの案内を1通送る
  4. 送った／送らなかった結果を Supabase の survey_sends に記録する

秘密情報は環境変数から読む。ファイルやチャットに書かない。
  LINE_CHANNEL_ACCESS_TOKEN   Messaging API チャネルの長期アクセストークン
  SUPABASE_URL                https://xxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   Supabase の service_role キー（記録用。anon では survey_sends に書けない）

使い方:
  # 自分宛てのテスト（Supabase には記録しない）
  python3 send_survey.py --test-to Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx --store meguro

  # 本番（CSV の全員に。10% はホールドアウトで送らない）
  python3 send_survey.py --csv targets_2026-10-26.csv

  # 送らずに割当だけ確認
  python3 send_survey.py --csv targets.csv --dry-run
"""
import argparse, csv, hashlib, json, os, sys, urllib.request, urllib.error, uuid
from datetime import datetime, timezone

LIFF_ID = "2011912835-rae1buWg"
HOLDOUT_PERCENT = 10
PUSH_URL = "https://api.line.me/v2/bot/message/push"


def liff_url(store_id, visit_id, send_id):
    return f"https://liff.line.me/{LIFF_ID}?s={store_id}&v={visit_id}&send={send_id}"


def build_message(url):
    """画像なし・文言＋ボタン1つのカード（Flex）。画像を使う場合は hero を足す。"""
    return {
        "type": "flex",
        "altText": "ご来店ありがとうございました。30秒で終わるアンケートにご協力ください",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box", "layout": "vertical", "spacing": "md",
                "contents": [
                    {"type": "text", "text": "ご来店ありがとうございました", "weight": "bold", "size": "lg", "wrap": True},
                    {"type": "text", "text": "お客様により良い時間をお届けするため、30秒で終わるアンケートにご協力ください。", "size": "sm", "color": "#666666", "wrap": True},
                ],
            },
            "footer": {
                "type": "box", "layout": "vertical",
                "contents": [
                    {"type": "button", "style": "primary", "color": "#d9452b",
                     "action": {"type": "uri", "label": "アンケートに答える", "uri": url}}
                ],
            },
        },
    }


def is_holdout(visit_id, user_id):
    h = hashlib.sha256(f"{visit_id}|{user_id}".encode()).hexdigest()
    return int(h[:8], 16) % 100 < HOLDOUT_PERCENT


def push(token, user_id, message):
    body = json.dumps({"to": user_id, "messages": [message]}).encode()
    req = urllib.request.Request(PUSH_URL, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}",
        "X-Line-Retry-Key": str(uuid.uuid4()),
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def record(supabase_url, service_key, rows):
    if not rows:
        return
    req = urllib.request.Request(f"{supabase_url}/rest/v1/survey_sends", data=json.dumps(rows).encode(), method="POST", headers={
        "apikey": service_key, "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json", "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="対象者CSV（列: line_user_id, visit_id, store_id）")
    ap.add_argument("--test-to", help="自分のUID宛てにテスト送信（記録しない）")
    ap.add_argument("--store", default="meguro")
    ap.add_argument("--dry-run", action="store_true", help="送らず割当だけ表示")
    a = ap.parse_args()

    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not token and not a.dry_run:
        sys.exit("環境変数 LINE_CHANNEL_ACCESS_TOKEN がありません")

    if a.test_to:
        send_id = str(uuid.uuid4())
        url = liff_url(a.store, f"test_{datetime.now().strftime('%m%d%H%M')}", send_id)
        if a.dry_run:
            print("dry-run:", url); return
        status, body = push(token, a.test_to, build_message(url))
        print("push:", status, body or "ok")
        return

    if not a.csv:
        sys.exit("--csv か --test-to を指定してください")

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not a.dry_run and not (supabase_url and service_key):
        sys.exit("環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY がありません（記録に必要）")

    now = datetime.now(timezone.utc).isoformat()
    results, sent, held, failed = [], 0, 0, 0
    with open(a.csv, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            uid, visit_id, store_id = r["line_user_id"].strip(), r["visit_id"].strip(), (r.get("store_id") or a.store).strip()
            if not uid or not visit_id:
                continue
            send_id = str(uuid.uuid4())
            row = {"send_id": send_id, "visit_id": visit_id, "line_user_id": uid, "store_id": store_id, "scheduled_at": now}
            if is_holdout(visit_id, uid):
                row.update(holdout_group="hold", status="hold"); held += 1
                print(f"hold  {visit_id} {uid[:6]}…")
            else:
                row.update(holdout_group="send")
                if a.dry_run:
                    row.update(status="planned"); print(f"send  {visit_id} {uid[:6]}… (dry-run)")
                else:
                    status, body = push(token, uid, build_message(liff_url(store_id, visit_id, send_id)))
                    if status == 200:
                        row.update(status="sent", sent_at=datetime.now(timezone.utc).isoformat()); sent += 1
                        print(f"sent  {visit_id} {uid[:6]}…")
                    else:
                        row.update(status="failed", error=f"{status} {body[:200]}"); failed += 1
                        print(f"FAIL  {visit_id} {uid[:6]}… {status} {body[:120]}")
            results.append(row)

    if not a.dry_run:
        record(supabase_url, service_key, results)
    print(f"\n合計 {len(results)} 件: 送信 {sent} / ホールドアウト {held} / 失敗 {failed}" + ("（dry-run）" if a.dry_run else ""))


if __name__ == "__main__":
    main()
