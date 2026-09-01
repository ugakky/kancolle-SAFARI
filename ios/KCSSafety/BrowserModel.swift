import Foundation
import WebKit

@MainActor
final class BrowserModel: ObservableObject {
    @Published var statusText = "起動中"
    @Published var webProcessTerminations = 0
    @Published var lastTerminationAt: Date?

    let webView: WKWebView

    init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        self.webView = webView
    }

    func loadGame() {
        guard let url = URL(string: "https://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854/") else { return }
        statusText = "読み込み中"
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 60))
    }

    func reload() {
        statusText = "再読み込み中"
        webView.reload()
    }

    func markLoaded() {
        statusText = "接続中"
    }

    func markWebProcessTerminated() {
        webProcessTerminations += 1
        lastTerminationAt = Date()
        statusText = "WebKit終了を検知"
    }
}
