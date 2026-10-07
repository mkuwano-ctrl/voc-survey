# VOC アンケート 回答画面（LIFF）v0

静的なHTML＋JSだけで動く。ビルド不要。どこに置いても（Lovable / GitHub Pages / Vercel）HTTPSで配信できればLIFFのエンドポイントになる。

取得する個人情報は **LINE のユーザーID（UID）だけ**。表示名・アイコンなどのプロフィールは取得も保存もしない（LIFF の Scope は `openid` のみ。`profile` は付けない）。

## ファイル

| ファイル | 役割 |
|---|---|
| index.html | 画面の骨組み。LIFF SDK と supabase-js を CDN から読む |
| app.js | 設問・分岐・保存・LIFF認証 |
| styles.css | 見た目（スマホ前提、1画面1問、0〜10タップ） |
| config.js | **環境ごとに差し替える唯一のファイル**。LIFF ID／Supabase URL・anon key／店舗名・口コミURL／プラポリURL |
| supabase/001_schema.sql | Supabase に貼るテーブル定義とRLS |
| supabase/002_drop_display_name.sql | 001 を実行済みのプロジェクト向け。表示名の列を削除する |

秘密情報（チャネルシークレット・チャネルアクセストークン・Supabase service_role key）はこのフォルダに置かない。

## 設問の流れ

intro → 01 総合（0〜10）→ 02 再来店（0〜10）→ 03 気になった点（複数選択）→ ［選んだ領域ごとに 03-n 詳細（単一選択）］→ 04 一言（任意）→ 05 スタッフ（任意）→ 06 知ったきっかけ（任意）→ 完了（Google口コミリンクは設定時のみ）

「特になし」を選ぶと分岐なしで 04 へ進む。必須3問に答えるまで「次へ」は押せない。1画面進むごとに Supabase の行を更新する。

## 動かすまでの手順

1. Supabase で新規プロジェクトを作り、SQL Editor に `supabase/001_schema.sql` を貼って Run
2. `config.js` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を埋める（Project Settings → API）
3. `config.js` の `STORES` に店名を入れる（検証中は仮名「たこ焼きや 目黒店」）。`googleReviewUrl` は任意で、空なら完了画面の口コミリンクは出ない（今回は未接続）。`PRIVACY_URL` は設定済み
4. このフォルダをHTTPSで公開する（下記）。現在は GitHub Pages: https://mkuwano-ctrl.github.io/voc-survey/
5. LINE Developers → LINE Login チャネル「VOCアンケート（検証）」→ LIFF → エンドポイントURL を公開URLに変更（設定済み）
6. 自分のLINEで `https://liff.line.me/2011912835-rae1buWg?s=meguro&v=test001` を開く。初回は同意画面→友だち追加画面が出る。回答が Supabase の `survey_responses` に入ればOK

## 公開先の候補

- **Lovable**: 空のプロジェクトを作り GitHub 連携 → 連携リポジトリの `public/` にこの4ファイルを置く → Publish。公開URLは `https://<project>.lovable.app/index.html`
- **GitHub Pages**: リポジトリ直下にこの4ファイル → Settings → Pages → Branch: main / root。公開URLは `https://<user>.github.io/<repo>/`
- 開発中の確認: PCブラウザで `index.html?dev=1&s=meguro` を開くと LIFF なしで画面だけ動く（UIDは `DEV_...`、`is_dev=true` で保存される）

## 配信URLの作り方（Messaging API から送るとき）

`https://liff.line.me/2011912835-rae1buWg?s=<店舗ID>&v=<来店ID>&send=<配信ID>`

LIFF は `?` 以降をそのままエンドポイントに渡す。来店IDと配信IDが回答行に残り、visits / survey_sends と突合できる。

## まだやっていないこと（Phase 2）

- IDトークンをサーバー側で検証してから保存する（今は画面が渡した UID をそのまま信じている。検証中のパイロットでは許容）
- 翌日12:00 の自動配信（今は手動）
- visits の自動取り込み（依頼C 待ち）
