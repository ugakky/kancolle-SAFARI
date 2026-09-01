import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var browser: BrowserModel
    @EnvironmentObject private var ads: AdManager

    @State private var memoryWarningCount = 0

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            BrowserView()
            Divider()
            AdBannerArea()
        }
        .ignoresSafeArea(.keyboard)
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            memoryWarningCount += 1
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("KCS Safety")
                    .font(.caption.bold())
                Text(browser.statusText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if memoryWarningCount > 0 {
                Label("RAM警告 \(memoryWarningCount)", systemImage: "memorychip")
                    .font(.caption2.bold())
                    .foregroundStyle(.orange)
            }

            if browser.webProcessTerminations > 0 {
                Label("WebKit \(browser.webProcessTerminations)", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption2.bold())
                    .foregroundStyle(.red)
            }

            if ads.privacyOptionsRequired {
                Button("広告設定") {
                    Task { await ads.presentPrivacyOptions() }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            Button {
                browser.reload()
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("再読み込み")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.bar)
    }
}
