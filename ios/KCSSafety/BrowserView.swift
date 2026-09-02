import SwiftUI
import WebKit

struct BrowserView: UIViewRepresentable {
    @EnvironmentObject private var model: BrowserModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = model.webView
        let controller = webView.configuration.userContentController

        controller.removeScriptMessageHandler(forName: "kcsBridge")
        controller.add(context.coordinator, name: "kcsBridge")

        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        if webView.url == nil {
            model.loadGame()
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "kcsBridge")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        private let model: BrowserModel

        init(model: BrowserModel) {
            self.model = model
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "kcsBridge" else { return }
            Task { @MainActor in
                model.handleBridgeMessage(message.body)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { @MainActor in
                model.markLoaded()
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                model.markNavigationFailed(error.localizedDescription)
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            Task { @MainActor in
                model.markNavigationFailed(error.localizedDescription)
            }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            Task { @MainActor in
                model.markWebProcessTerminated()
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil,
               let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
    }
}
