import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var browser: BrowserModel
    @EnvironmentObject private var ads: AdManager

    @State private var memoryWarningCount = 0
    @State private var showSupportPanel = false

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()

            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    BrowserView()
                    ProgressGuardLayer(containerSize: proxy.size)
                }
            }

            Divider()
            AdBannerArea()
        }
        .ignoresSafeArea(.keyboard)
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            memoryWarningCount += 1
        }
        .sheet(isPresented: $showSupportPanel) {
            SupportPanelView()
                .environmentObject(browser)
        }
    }

    private var toolbar: some View {
        HStack(spacing: 9) {
            VStack(alignment: .leading, spacing: 1) {
                Text("KCS Safety")
                    .font(.caption.bold())
                Text(browser.statusText)
                    .font(.caption2)
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
            }

            Spacer(minLength: 6)

            if let snapshot = browser.snapshot {
                Text("API \(snapshot.apiCount)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            if memoryWarningCount > 0 {
                Label("RAM \(memoryWarningCount)", systemImage: "memorychip")
                    .font(.caption2.bold())
                    .foregroundStyle(.orange)
                    .labelStyle(.titleAndIcon)
            }

            if browser.webProcessTerminations > 0 {
                Label("WebKit \(browser.webProcessTerminations)", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption2.bold())
                    .foregroundStyle(.red)
                    .labelStyle(.titleAndIcon)
            }

            Button {
                showSupportPanel = true
            } label: {
                Image(systemName: browser.snapshot?.heavyCount ?? 0 > 0 ? "exclamationmark.shield.fill" : "list.bullet.rectangle")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .tint(browser.snapshot?.heavyCount ?? 0 > 0 ? .red : nil)
            .accessibilityLabel("艦隊状態と設定")

            if ads.privacyOptionsRequired {
                Button {
                    Task { await ads.presentPrivacyOptions() }
                } label: {
                    Image(systemName: "hand.raised")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("広告プライバシー設定")
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
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private var statusColor: Color {
        if browser.snapshot?.heavyCount ?? 0 > 0 { return .red }
        if browser.snapshot?.uncertain == true { return .orange }
        return .secondary
    }
}
