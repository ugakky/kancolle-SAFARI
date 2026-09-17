# Chrome / Tampermonkey v2.5

Chromeでは次の2ファイルをTampermonkeyへ追加して有効化してください。

1. `kancolle-page-bridge.chrome.user.js`
2. `kancolle-safety.chrome.user.js`

旧 `kancolle-audit-export.chrome.user.js` はv2.5でno-opです。

ChromeラッパーはSafari版v2.5実装をcommit SHA `c742e8dbc1cbb1cf05fc6bd3cefcf2875f140c5e` に固定した `@require` で読み込みます。GitHubへの取得はTampermonkeyのインストール/更新時に行われ、ゲームプレイ中に艦これサーバーへ追加通信を発生させるものではありません。

Tampermonkey v5系では `@sandbox raw` を指定し、ゲームframe側のBridgeがページコンテキストで通常通信を受動観測します。

Chromeのバージョンによっては、拡張機能の設定で「ユーザースクリプトを許可」を有効にする必要があります。

機能・安全境界・取得手順は `V2.5.md` と同じです。
