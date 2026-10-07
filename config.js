// VOC アンケート 設定（この1ファイルだけ環境ごとに差し替える）
// ここに書くのは「公開されても問題ない値」だけ。チャネルシークレットやチャネルアクセストークンは絶対に書かない。
window.VOC_CONFIG = {
  // LINE Login チャネル「VOCアンケート（検証）」の LIFF ID（2026-10-07 発行）
  LIFF_ID: "2011912835-rae1buWg",

  // Supabase（VOC用プロジェクト）。anon key は公開用の鍵なのでここに置いてよい
  SUPABASE_URL: "https://REPLACE_ME.supabase.co",
  SUPABASE_ANON_KEY: "REPLACE_ME",

  // 店舗ごとの表示情報。URL の ?s=<store_id> で切り替える。該当がなければ default を使う
  STORES: {
    default: {
      name: "銀だこハイボール酒場 銀座一丁目店",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=REPLACE_ME",
    },
    ginza1: {
      name: "銀だこハイボール酒場 銀座一丁目店",
      googleReviewUrl: "https://search.google.com/local/writereview?placeid=REPLACE_ME",
    },
  },

  // フッターに出すプライバシーポリシー（セルフオーダーと同じURLを流用）
  PRIVACY_URL: "https://REPLACE_ME",

  // ?dev=1 を付けて PC ブラウザで開いたときに LIFF を使わず画面だけ確認するモード
  ALLOW_DEV_MODE: true,
};
