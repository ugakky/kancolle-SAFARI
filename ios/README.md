# KCS Safety iOS 専ブラ（非公式・試作）

iPhone / iPad 向けの非公式専用ブラウザです。Safari版とは別に、1枚の永続 `WKWebView` でDMMゲームページを表示し、艦隊情報・大破進撃ガード・メモリ診断をネイティブUIで提供します。

> 公式アプリではありません。公式ロゴ・公式アプリアイコンを使用しない方針です。

## 目的

- `WKWebView` を1枚だけ使ってゲームを表示する
- Safariの他タブと分離してメモリ競合を減らす
- WebKitプロセス終了を検知し、自動復旧する
- iOSのメモリ警告回数を表示する
- kcsapiを読み取り、第1〜第4艦隊をネイティブUIで確認する
- Cond / HP / 燃料 / 弾薬 / 搭載数を表示する
- 大破またはHP判定不明時に進撃系操作をブロックする
- ゲーム画面を `1200:720 = 5:3` の比率で認識し、縦横回転時もブロッカーをゲーム内へ収める
- ゲーム画面外の下部に広告枠を設ける

## 現在の実装

### 専用ブラウザ

- SwiftUI アプリ
- 1枚の永続 `WKWebView`
- DMMゲームページ読み込み
- デスクトップ表示モード
- Cookie / Webサイトデータはデフォルトの永続ストアを使用
- ポップアップ要求は同じWebViewで開く
- 縦画面 / 横画面対応

### 艦隊支援

- ページ内の XHR / fetch を `WKUserScript` で監視
- 必要な kcsapi のみ解析
- 第1〜第4艦隊タブ
- 艦名 / Lv
- HP
- Cond
- 燃料 / 弾薬
- 各スロット搭載数
- 通常艦隊 / 連合艦隊の出撃艦隊追跡
- 戦闘APIから戦闘後HPを計算
- 大破 / 中破 / 小破判定
- 航空戦の直近損失情報

Cond は未取得時に `0` とみなさず `? 不明` と表示します。

### 大破進撃ガード

- 戦闘結果で大破艦あり、またはHP判定不明の場合に赤いブロッカーを表示
- 約2.4秒以内に3回タップすると5秒だけ一時解除
- 解除後も実際の進撃操作はユーザー自身が行う
- 横幅 / 縦幅を20〜100%で変更可能
- X / Y位置も調整可能
- 設定は `UserDefaults` に保存
- 「確認」で4秒間プレビュー表示
- ブロッカーは検出したゲーム領域内へクランプ

### ゲーム領域認識

DMMページ全体や縦長iframeをゲーム本体とみなさず、候補iframeの上端から `1200:720 = 5:3` の領域だけをゲーム本体として扱います。

1200×720px固定ではありません。現在の横幅に対して高さを比率計算するため、縦向き・横向き・Safari/WKWebViewの表示サイズ変更に追従します。

### メモリ / WebKit診断

- iOSメモリ警告回数を上部バーに表示
- `webViewWebContentProcessDidTerminate` を検知
- WebKit終了回数を表示
- WebKit終了時は古いHP / Cond情報を破棄
- 約0.7秒後に自動リロードして復旧を試行
- API取得数と最後に受信したAPIを表示

## 広告

Google Mobile Ads SDK (AdMob) の adaptive banner を、ゲーム画面へ重ねずWebView外の下部に表示します。

開発版はGoogle公式のテスト用IDだけを使用します。

- Sample App ID: `ca-app-pub-3940256099942544~1458002511`
- Test Banner ID: `ca-app-pub-3940256099942544/2435281174`

### 本番広告について

DMM GAMES / 対象ゲーム側について、第三者アプリによる表示・アクセス・収益化の許可条件を確認できるまでは、本番AdMob IDへ切り替えません。

Google User Messaging Platform (UMP) も組み込み、広告リクエスト前に同意状態を更新します。

- 必要な場合は同意フォームを表示
- `ConsentInformation.shared.canRequestAds == true` の場合だけ広告SDKを開始
- 必要な地域では広告プライバシー設定を再表示可能

トラッキングベースの広告を将来有効にする場合は、Apple App Tracking Transparency (ATT) の要件も別途確認します。

## ビルド

`project.yml` は XcodeGen 用です。

```bash
brew install xcodegen
cd ios
xcodegen generate
open KCSSafety.xcodeproj
```

Xcode 16 以降を使用します。

GitHub Actions でも以下を自動確認します。

1. XcodeGenでプロジェクト生成
2. Swift Package Manager依存関係解決
3. iOS Simulator向けDebugビルド

## 現在の確認状況

- Xcode 16.4
- Google Mobile Ads SDK 13.9.0
- Google User Messaging Platform 3.1.0
- iOS Simulator向けコンパイル確認

実際のDMMログイン、ゲーム起動、長時間海域でのメモリ挙動、大破ブロッカーの実位置はiPhone実機で確認が必要です。

## 安全上の注意

このツールのHP表示や大破ガードは補助機能です。API仕様変更・通信中断・WebKit再起動などで判定できない場合があります。イベント本番へ投入する前に通常海域で確認してください。
