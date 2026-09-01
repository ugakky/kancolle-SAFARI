# KCS Safety iOS 専ブラ（試作）

非公式の iPhone / iPad 向け専用ブラウザ試作です。

## 目的

- `WKWebView` を1枚だけ使ってDMM/ゲーム画面を表示する
- Safariの他タブと分離してメモリ競合を減らす
- WebKitプロセス終了を検知する
- iOSのメモリ警告回数を表示する
- 将来的にSafari版の艦隊 / Cond / 大破警告をネイティブUIへ移植する
- 画面下部に広告枠を設けて、ゲーム画面への重なりを避ける

## 広告

Google Mobile Ads SDK (AdMob) のバナー広告を使用します。

開発版では必ずGoogle公式のテスト用IDを使用します。

- Sample App ID: `ca-app-pub-3940256099942544~1458002511`
- Test Banner ID: `ca-app-pub-3940256099942544/2435281174`

本番公開前に自身のAdMob App ID / Ad Unit IDへ置換してください。

### 重要

第三者サービスの内容を表示しながら広告で収益化するアプリは、App Store Review Guidelines 5.2.2 の観点から、そのサービスの利用規約上、表示・アクセス・収益化が許可されていることを確認する必要があります。

そのため、DMM GAMES / 対象ゲーム側の許可条件を確認できるまでは本番広告IDへ切り替えず、テスト広告だけで開発してください。

## プライバシー

広告リクエスト前に Google User Messaging Platform (UMP) を通します。

- アプリ起動ごとに同意状態を更新
- 必要な場合は同意フォームを表示
- `ConsentInformation.shared.canRequestAds == true` の場合だけ広告SDKを開始
- 必要な地域ではアプリ内に「広告設定」を表示

トラッキングベースの広告を有効にする場合は、Apple App Tracking Transparency (ATT) の要件も別途満たしてください。

## 生成方法

`project.yml` は XcodeGen 用です。

```bash
brew install xcodegen
cd ios
xcodegen generate
open KCSSafety.xcodeproj
```

Xcode 16 以降を使用してください。

## 現在の実装

- SwiftUI アプリ
- 1枚の永続 `WKWebView`
- DMMゲームページ読み込み
- Cookie / Webサイトデータはデフォルトの永続ストアを使用
- ポップアップ要求は同じWebViewで開く
- `webViewWebContentProcessDidTerminate` の検知
- iOSメモリ警告回数表示
- 下部 AdMob adaptive banner
- UMP同意処理
- 縦画面 / 横画面対応

## 次に移植するもの

1. kcsapi の読み取り
2. 第1〜第4艦隊
3. Cond
4. HP / 燃料 / 弾薬 / 搭載数
5. 大破進撃ガード
6. 5:3ゲーム領域認識
7. 診断ログ

## 名称 / 表示

公式アプリと誤認されない名称・アイコンを使用し、公式ロゴや公式アプリアイコンは使用しない方針です。
