# 艦これ Complete Passive Audit v0.2

## ファイル

- Safari / iPhone / iPad Userscripts: `kancolle-audit-export.user.js`
- Chrome / Tampermonkey: `kancolle-audit-export.chrome.user.js`

## 安全方針

この監査スクリプトは艦これサーバーへ独自の XHR / fetch を送信しません。ゲーム本体が通常操作で受信したレスポンスだけを受動観測します。request body、api_token、Cookie は保存・転送しません。

したがって「完全取得」は自動API巡回ではなく、必要なゲーム画面をユーザーが通常操作で開き、そのときゲーム自身が発行した通信を収集する方式です。

## v0.2 の改善点

- `api_get_member/*` を広く受動保存し、`member.raw_get_member` に収録
- 基地航空隊を方面ごとにマージし、最後に開いた1方面だけで上書きしない
- `api_req_air_corps/*` の通常操作レスポンスも観測して基地情報を補完
- 任務ページ番号を記録し、全ページ取得済みか判定
- 建造ドックを追加
- 14項目の取得チェックリストを画面に常時表示
- 未取得項目に応じて次に開く画面を案内
- JSONに `coverage` / `captures` / `captured_at` / `raw_get_member` を追加
- Safari版とChrome/Tampermonkey版を同じJSON構造に統一

## 完全取得の推奨手順

1. スクリプトを有効にして艦これを再読み込み
2. 母港へ戻る
3. 編成を開く
4. 改装・装備一覧を開く
5. 入渠を開く
6. 工廠を開く
7. 遠征画面を開く
8. 任務を1ページ目から最終ページまで手動表示
9. 出撃の海域選択画面を開く
10. 基地航空隊が存在する各方面を順番に開き、基地航空隊画面を表示
11. 母港へ戻る
12. 画面右下の取得チェックを確認し、`JSON書き出し` を実行

基地航空隊は複数方面を開くと方面ID・基地ID単位で蓄積します。

## Chrome

Tampermonkey に `kancolle-audit-export.chrome.user.js` の全文を貼り付けて保存します。Chrome 138以降ではTampermonkeyの拡張機能設定で「ユーザースクリプトを許可」を有効にしてください。

Chrome版は `@sandbox raw` でページコンテキストを要求し、ゲーム本体の XHR / fetch を受動観測します。

## 出力

`kancolle_final_audit_YYYYMMDD-HHMMSS.json`

主要フィールド:

- `status`: 艦娘・装備・任務・基地・海域の件数とcoverage
- `coverage`: 14項目の取得成否
- `master`: start2由来マスター
- `member`: 所持艦、装備、艦隊、入渠、建造、資源、アイテム、提督、遠征、海域、基地航空隊など
- `member.raw_get_member`: セッション中に通常取得できた `api_get_member/*` の生データ
- `quests`: 手動表示した全任務ページの統合結果
- `captures`: 観測したAPIパス
- `captured_at`: 各APIの最終観測時刻

## 制約

ゲーム本体がそのセッションで通信しなかった情報を、受動方式だけで強制取得することはできません。取得チェックが未完了の場合は表示された案内に従って対象画面を通常操作で開いてください。
