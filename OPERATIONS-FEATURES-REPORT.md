# 実運用向け追加機能 実装報告

## 実装済み

### 空き人数・満員制御

- 日付・教室・開始時間ごとの授業枠と定員
- 振替候補の予約人数、定員、残り人数表示
- 満員枠と授業がない日の選択禁止
- DB行ロックと再集計による同時予約の定員超過防止
- 保護者による`absence_records`への直接INSERT禁止
- 先生画面の「授業枠・定員」一覧
- 管理者だけが授業枠と定員を追加・変更可能
- 現在の予約人数未満への定員変更を禁止

### LINE通知

- 申請完了後の保護者向け受付メッセージ
- 受付番号の日次連番発行
- 先生LINEへの欠席・振替通知
- LINEユーザーIDをDBへ平文保存せず、通知結果にはHMACだけを保存
- 通知失敗時も申請データは失わず、送信結果を記録

### CSV

- `欠席一覧.csv`
- `振替一覧.csv`
- `未振替一覧.csv`
- 教室・日付・生徒検索条件を反映
- Excelで開けるUTF-8 BOM
- CSV数式インジェクション対策

### セキュリティ

- 保護者と生徒の所有関係をDB RPCで再確認
- RLSを維持
- 保護者への全件取得権限なし
- LINE IDトークンをサーバー側で再検証
- LocalStorage・SessionStorageへの個人情報保存なし
- 定員チェックを画面とDBの両方で実施

## 未実装

- LINE通知の自動再送キュー
- 先生画面から通知失敗を再送する操作
- 定員枠の曜日別一括作成
- CSVの期間指定専用画面

## 要確認

- `05_capacity_notifications.sql`の本番Supabase適用
- `submit-absence` Edge Functionのデプロイ
- Messaging APIチャネルアクセストークンの設定
- 先生LINEユーザーIDの設定
- LINE LoginとMessaging APIチャネルが同じProviderにあること
- 保護者・先生が公式LINEを友だち追加していること
- 定員1名に対する2件同時送信テスト
- 実LINEへの保護者返信・先生通知テスト
- 本番データでのCSV文字化け確認

## 本番適用順

1. `supabase/05_capacity_notifications.sql`をSQL Editorで実行
2. `submit-absence`をデプロイ
3. Supabase Secretsへ通知設定を登録
4. `config.js`の`absenceSubmitEndpoint`を設定
5. 管理者で授業枠と定員を登録
6. 同時予約、LINE通知、CSVをテスト

