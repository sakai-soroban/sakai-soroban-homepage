# さかいそろばん教室 欠席・振替管理アプリ

公式LINEのリッチメニューからLIFFで開く本番構成を前提としています。

## 保護者画面

- LINEログイン
- 生徒名入力（ログイン中の家庭に紐づく生徒だけと照合）
- 兄弟の複数追加
- 教室選択（福沼教室・穂波教室）
- 通常曜日選択
- 欠席日・理由・振替希望日の選択
- 空き人数表示と満員制御
- 受付番号表示とLINE受付通知

## 先生・管理者画面

- 欠席・振替・未振替一覧
- 教室・日付・生徒名検索
- 授業枠と定員管理
- CSV出力
- 監査ログ

## GitHubへアップロードする場所

このフォルダの中身を、GitHubリポジトリ`Sakai-soroban-app`の直下へアップロードします。

公開画面に必要な基本ファイルは次の5つです。

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `logo.svg`

Supabase連携には`supabase`フォルダも必要です。秘密鍵や`.env`ファイルはGitHubへアップロードしません。

## 導入順

1. [LIFF-PRODUCTION-GUIDE.md](LIFF-PRODUCTION-GUIDE.md)を確認
2. Supabaseで`supabase-schema.sql`を実行
3. LINE LoginチャネルとLIFFアプリを作成
4. 認証交換APIを安全なサーバー環境へ実装
5. `config.js`へLIFF ID、API URL、Supabase公開情報を設定
6. HTTPSへ配置
7. 公式LINEのリッチメニューへLIFF URLを設定
8. `security-verification.sql`でRLSを確認

## セキュリティ

- 保護者のメール・パスワード入力なし
- LINE IDトークンは必ずサーバー側で検証
- LINE Channel Secretとservice role keyはブラウザへ置かない
- 個人情報とトークンをLocalStorage・SessionStorageへ保存しない
- 保護者はRLSで自分の子どもだけ取得
- 監査ログは更新・削除不可
