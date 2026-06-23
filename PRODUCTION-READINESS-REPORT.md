# 本番運用前確認レポート

確認日：2026年6月23日

## 結論

画面、SQL、RLS、監査、LIFF認証交換APIのコードは用意されていますが、`config.js`はすべてプレースホルダーです。現時点では本番接続前であり、実アカウント・実データによる結合試験は未完了です。

## 実装済み

### 保護者画面

- 「保護者さま専用」「欠席・振替連絡」「約30秒で送信できます」を表示
- 「LINEで本人確認して利用する」ボタンを表示
- 「パスワード不要」「兄弟もまとめて連絡可能」「24時間受付」を表示
- 保護者向けメールアドレス・パスワード入力欄を撤去
- 未認証状態では申請画面と生徒情報を非表示
- LIFF認証後に`students`から生徒を取得する処理
- 子ども1人なら自動選択、複数なら兄弟選択肢を表示する処理
- 欠席日、理由、振替希望、振替日、時間の入力
- 申請送信と完了画面への遷移

### 先生画面

- 先生・管理者以外を管理画面へ入れない画面制御
- 今日の欠席、今日の振替、未振替、全連絡、監査ログのタブ
- 教室、日付、生徒名の検索UI
- 検索条件をPostgRESTクエリとサーバー集計RPCへ渡す処理
- 欠席・振替一覧の表示処理

### セキュリティ

- 保護者・生徒の1対多テーブル
- LINEユーザーIDのHMAC保存
- 一回限り・有効期限付き招待コード
- 公開テーブルへのRLS定義
- 保護者は自分の子どもだけ取得・登録可能
- 先生・管理者だけ全件閲覧可能
- 管理者だけ保護者・生徒の変更が可能
- 監査ログの更新・削除禁止トリガー
- 操作者、日時、対象生徒、保護者、IP、リクエストID、変更前後を監査
- LocalStorage・SessionStorageを使用しない
- Channel Secret、service role keyをクライアントへ置かない構成
- HTTPS以外を拒否（localhostは開発例外）

## 未実装

- Supabase Realtimeによる先生画面の自動更新
- 招待コード発行用の管理者画面
- 保護者・生徒の追加編集用管理者画面
- 先生アカウントのMFA必須化
- 認証交換APIのレート制限・WAF
- LINEログイン失敗や不正コード試行の専用監査
- E2E自動テスト
- RLSのpgTAP自動テスト
- ステージング環境と本番環境の分離設定
- Vercel用プロジェクト設定ファイル

## 要確認

### 保護者画面

- 実LINEアカウントでLIFFログインできること
- 初回招待コードが一度だけ利用できること
- 2回目以降に招待コードなしで申請画面へ進むこと
- 1人家庭は自動選択されること
- 兄弟家庭は兄弟だけ表示されること
- 他家庭の生徒がAPIレスポンスへ含まれないこと
- 欠席・振替申請がSupabaseへ保存され完了画面になること

### 先生画面

- 先生・管理者アカウントでログインできること
- 実データで欠席・振替・未振替一覧が正しいこと
- 教室・日付・生徒名の各検索と複合検索が正しいこと
- 保護者アカウントで管理APIが拒否されること

### Supabase

- `supabase/01_schema.sql`から`04_functions.sql`まで順番に適用
- `security-verification.sql`を実行
- RLSが全公開テーブルで有効
- `anon`に業務テーブル権限がない
- Authユーザー、`profiles`、`guardians`、`students`の紐付け
- Edge Functionsの環境変数登録
- Edge Functionsのデプロイ
- SSL Enforcement、Network Restrictions、Supabase管理者MFA
- バックアップ、PITR、ログ保存期間
- 独自JWTが現在のSupabase JWT署名方式で受理されること

### LINE Developers

- LINE Loginチャネルと公式アカウントをリンク
- LIFF Endpoint URLへ本番HTTPS URLを設定
- Scopeは`openid`を必須、必要なら`profile`
- LIFF IDを`config.js`へ設定
- LIFF URL `https://liff.line.me/{LIFF_ID}`を取得
- LINE Channel IDをEdge FunctionsのSecretへ設定
- 本番公開ステータスとコールバック設定

### 公式LINEリッチメニュー

- 「欠席・振替」のタップ領域を作成
- URIアクションへ`https://liff.line.me/{LIFF_ID}`を設定
- リッチメニューを公式アカウントのデフォルトへ設定
- iOS／Android両方で起動確認

### Vercel公開

1. GitHub等へソースを登録
2. VercelでリポジトリをImport
3. Root Directoryをアプリの公開ディレクトリへ設定
4. `config.js`へ本番の公開設定を反映
5. Production Deploy
6. 独自ドメインを設定してHTTPSを確認
7. 本番URLをLIFF Endpoint URLと`APP_ORIGIN`へ登録
8. CSPの接続先が本番Supabase・LINE・認証APIを許可しているか確認
9. Preview URLを本番LIFF設定へ使用しない

## 現在の接続状態

- LIFF ID：未設定
- LINE認証交換API URL：未設定
- Supabase Project URL：未設定
- Supabase anon/publishable key：未設定

したがって、本番データを使う項目は「コード実装済み・実環境未確認」です。
