// VOC アンケート 設定（この1ファイルだけ環境ごとに差し替える）
// ここに書くのは「公開されても問題ない値」だけ。チャネルシークレットやチャネルアクセストークンは絶対に書かない。
window.VOC_CONFIG = {
  // LINE Login チャネル「VOCアンケート（検証）」の LIFF ID（2026-10-07 発行）
  LIFF_ID: "2011912835-rae1buWg",

  // Supabase（VOC用プロジェクト）。anon key は公開用の鍵なのでここに置いてよい
  SUPABASE_URL: "https://llhdhcrwgwhpznrrzqfz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaGRoY3J3Z3docHpucnJ6cWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNTYzMzQsImV4cCI6MjEwNjkzMjMzNH0.3qc6LbqLRxukr2AxRuz1pDIEiLVJJ1N-bCX6SB8RM6I",

  // 店舗ごとの表示情報。URL の ?s=<store_id> で切り替える。該当がなければ default を使う
  // 検証中は仮の店名を使う（実店舗名は許諾後に設定する）
  // googleReviewUrl が空のときは完了画面の口コミリンクを出さない
  STORES: {
    default: { name: "たこ焼きや 目黒店", googleReviewUrl: "" },
    meguro: { name: "たこ焼きや 目黒店", googleReviewUrl: "" },
  },

  // フッターに出すプライバシーポリシー（セルフオーダー Ordee と同じページ）
  PRIVACY_URL: "https://tacoms.notion.site/Ordee-2f63832077048175a13fc149c8ef5072",

  // ?dev=1 を付けて PC ブラウザで開いたときに LIFF を使わず画面だけ確認するモード
  ALLOW_DEV_MODE: true,
};
