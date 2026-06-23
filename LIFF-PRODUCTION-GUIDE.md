# 公式LINE・LIFF本番運用ガイド

## 1. 必要なサービス

### LINE公式アカウント

保護者が普段使う入口です。リッチメニューに「欠席・振替」ボタンを作り、LIFF URLを設定します。

### LINE Developers

LINE LoginチャネルとLIFFアプリを作成します。

- LIFFサイズ：Full
- Scope：`openid`、`profile`
- メールアドレスは取得しない
- Endpoint URL：本番HTTPSのアプリURL
- LINE公式アカウントをチャネルへリンク

### Supabase

- PostgreSQL：保護者、生徒、欠席・振替、監査ログ
- Row Level Security：家庭ごとのデータ分離
- Auth：先生・管理者認証と、LINE認証後に発行する短時間セッション
- Edge Functionsまたは認証交換API：LINE IDトークンの検証

### HTTPS対応のホスティング

LIFF画面を配信します。例：Cloudflare Pages、Vercel、Netlify、独自サーバー。

### 同一ドメインの認証API

推奨構成は `https://app.example.jp/api/...` です。LINE Channel SecretとSupabase service role keyはこのサーバーだけに置きます。

## 2. 必要な設定

### LINE Developers

1. LINE Loginチャネルを作成
2. 公式LINEとチャネルをリンク
3. LIFFアプリを追加
4. Endpoint URLを設定
5. Scopeを`openid profile`に設定
6. LIFF IDを`config.js`へ設定

### LINE公式アカウント

1. リッチメニューを作成
2. 「欠席・振替」のアクションをリンクに設定
3. URLへ `https://liff.line.me/{LIFF_ID}` を指定

### Supabase

1. `supabase-schema.sql`を実行
2. `profiles`へ先生・管理者・保護者を登録
3. `students.guardian_id`で保護者と生徒を1対多で紐付け
4. 保護者ごとに初回連携コードを発行
5. 先生は`teacher`、管理者は`admin`ロールを設定
6. `security-verification.sql`を実行してRLSを確認

### サーバー秘密情報

以下はブラウザやGitへ置きません。

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_USER_ID_HMAC_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- Supabase JWT署名用秘密情報
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `TEACHER_LINE_USER_IDS`

### 空き人数・LINE通知

1. SQL Editorで`supabase/05_capacity_notifications.sql`を実行
2. `submit-absence` Edge Functionをデプロイ
3. `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`へMessaging APIのチャネルアクセストークンを設定
4. `TEACHER_LINE_USER_IDS`へ先生のLINEユーザーIDをカンマ区切りで設定
5. `config.js`の`absenceSubmitEndpoint`へ
   `https://PROJECT_REF.supabase.co/functions/v1/submit-absence`を設定
6. 管理者で先生画面へ入り「授業枠・定員」から授業枠と定員を登録

保護者・先生へのプッシュ通知には、通知先アカウントによる公式LINEの友だち追加が必要です。

## 3. 実装手順

### A. リッチメニューから起動

保護者が「欠席・振替」を押すとLIFF URLが開きます。

### B. LIFF初期化

画面を開くたびに`liff.init()`を実行します。LINE内では通常、自動的にログイン済みになります。外部ブラウザの場合だけ「LINEでログイン」を押します。

### C. LINE本人確認

ブラウザは`liff.getIDToken()`で取得した生のIDトークンを認証交換APIへ送ります。デコードしたプロフィールを本人確認に使ってはいけません。

### D. サーバーでLINEを検証

認証交換APIは次を実行します。

1. LINEの検証APIでIDトークンを検証
2. `aud`が自教室のChannel IDか確認
3. 有効期限、発行者、nonceを確認
4. LINEユーザーIDをサーバー秘密鍵でHMAC化
5. `private.guardian_line_identities`と照合

### E. 初回だけ連携

未連携なら`LINK_REQUIRED`を返します。保護者は教室から受け取った一回限りのコードを入力します。

サーバーはコードのハッシュ、有効期限、未使用状態を確認して、LINEユーザーIDのHMACと保護者IDを結びます。コードは直ちに使用済みにします。

### F. 短時間セッション発行

サーバーは保護者のSupabase Auth UUIDを`sub`に持つ短時間セッションを発行します。ブラウザではメモリだけに保持し、LocalStorage・SessionStorageへ保存しません。

ページを再度開いた場合は、LIFFのログイン状態からIDトークンを再取得してセッションを再発行します。

### G. 生徒取得

`students`を取得すると、RLSの`guardian_id = auth.uid()`によって本人の子どもだけが返ります。

- 子ども1人：自動選択
- 兄弟あり：兄弟だけ選択肢として表示
- 他家庭：APIレスポンスにも含まれない

### H. 申請・即時反映

保護者が送信すると`absence_records`へ登録されます。RLSは`student_id`が本人の子どもか再確認します。先生画面は再取得またはSupabase Realtime購読で即時更新します。

### I. 監査

生徒・欠席・振替の登録、変更、削除を監査ログへ保存します。

- 操作者UUIDと役割
- 日時
- 接続元IP
- リクエストID
- 対象生徒ID
- 変更前・変更後

監査ログには更新・削除禁止トリガーを設定しています。

## 4. 未実装の注意点

- LINE Channel ID・Secretがないため、実LINEログインの疎通試験は未実施
- 認証交換API本体のデプロイが必要
- 初回連携コードを安全に発行する管理者画面が必要
- Supabase Realtimeによる先生画面の自動更新は未実装
- リッチメニューはLINE Official Account Managerで別途作成が必要
- 先生のMFA、ログイン試行制限、アカウントロックが必要
- LINE IDトークンのnonce管理と認証APIのレート制限が必要
- IPはプロキシ構成によりヘッダーが異なるため、本番基盤で検証が必要
- 監査ログはDB管理者がトリガーを無効化できるため、より強い改ざん防止には外部ログ基盤への転送が必要
- 個人情報の保存期間、削除申請、漏えい時対応を教室の運用規程として決定する必要がある

## 認証交換APIの契約

### `POST /auth/line/exchange`

入力：

```json
{ "idToken": "LINE_ID_TOKEN" }
```

成功：

```json
{
  "session": {
    "access_token": "SHORT_LIVED_SUPABASE_JWT",
    "refresh_token": "",
    "expires_in": 900,
    "user": { "id": "GUARDIAN_AUTH_UUID" }
  }
}
```

未連携：

```json
{ "code": "LINK_REQUIRED" }
```

### `POST /auth/line/link`

入力：

```json
{
  "idToken": "LINE_ID_TOKEN",
  "linkCode": "ONE_TIME_CODE"
}
```

成功時は同じ短時間セッションを返します。
