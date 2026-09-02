import Foundation
import Combine
import WebKit
import UserNotifications

@MainActor
final class BrowserModel: ObservableObject {
    @Published var statusText = "起動中"
    @Published var webProcessTerminations = 0
    @Published var lastTerminationAt: Date?
    @Published var snapshot: KCSSnapshot?
    @Published var gameRect: KCSGameRect?
    @Published var expeditionSnapshot: KCSExpeditionSnapshot?
    @Published var expeditionNotificationsEnabled: Bool

    @Published var guardTapCount = 0
    @Published var guardPreview = false
    @Published var guardTemporarilyUnlocked = false

    @Published var guardWidthFraction: Double = 0.48 {
        didSet { saveGuardSettings() }
    }
    @Published var guardHeightFraction: Double = 0.74 {
        didSet { saveGuardSettings() }
    }
    @Published var guardCenterX: Double = 0.32 {
        didSet { saveGuardSettings() }
    }
    @Published var guardCenterY: Double = 0.53 {
        didSet { saveGuardSettings() }
    }

    let webView: WKWebView

    private let decoder = JSONDecoder()
    private var guardTaps: [Date] = []
    private var previewTask: Task<Void, Never>?
    private var relockTask: Task<Void, Never>?
    private var recoveryTask: Task<Void, Never>?

    private enum GuardDefaults {
        static let width = 0.48
        static let height = 0.74
        static let centerX = 0.32
        static let centerY = 0.53
        static let tapWindow: TimeInterval = 2.4
    }

    init() {
        let defaults = UserDefaults.standard
        expeditionNotificationsEnabled = defaults.bool(forKey: "expedition.notifications.enabled")

        if defaults.object(forKey: "guard.width") != nil {
            guardWidthFraction = defaults.double(forKey: "guard.width")
        }
        if defaults.object(forKey: "guard.height") != nil {
            guardHeightFraction = defaults.double(forKey: "guard.height")
        }
        if defaults.object(forKey: "guard.centerX") != nil {
            guardCenterX = defaults.double(forKey: "guard.centerX")
        }
        if defaults.object(forKey: "guard.centerY") != nil {
            guardCenterY = defaults.double(forKey: "guard.centerY")
        }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences.preferredContentMode = .desktop
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let bridge = WKUserScript(
            source: KCSBridgeScript.source,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(bridge)

        let expeditionBridge = WKUserScript(
            source: KCSExpeditionBridgeScript.source,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(expeditionBridge)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        self.webView = webView

        sanitizeGuardSettings()
    }

    var shouldShowGuard: Bool {
        if guardPreview { return true }
        guard snapshot?.choice == true else { return false }
        let isDangerous = (snapshot?.heavyCount ?? 0) > 0 || snapshot?.uncertain == true
        guard isDangerous else { return false }
        return !guardTemporarilyUnlocked
    }

    func loadGame() {
        guard let url = URL(string: "https://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854/") else { return }
        statusText = "読み込み中"
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 60))
    }

    func reload() {
        statusText = "再読み込み中"
        snapshot = nil
        gameRect = nil
        expeditionSnapshot = nil
        clearGuardSession()
        webView.reload()
    }

    func markLoaded() {
        if snapshot == nil {
            statusText = "ゲーム接続中 / API待ち"
        }
    }

    func markNavigationFailed(_ message: String) {
        statusText = "読込エラー: \(message)"
    }

    func markWebProcessTerminated() {
        webProcessTerminations += 1
        lastTerminationAt = Date()
        statusText = "WebKit終了 - 自動復旧中"

        // 古いHP/Cond/遠征情報を安全情報として残さない。
        snapshot = nil
        gameRect = nil
        expeditionSnapshot = nil
        clearGuardSession()

        recoveryTask?.cancel()
        recoveryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 700_000_000)
            guard !Task.isCancelled, let self else { return }
            if self.webView.url != nil {
                self.webView.reload()
            } else {
                self.loadGame()
            }
        }
    }

    func handleBridgeMessage(_ body: Any) {
        guard let json = body as? String,
              let data = json.data(using: .utf8) else { return }

        do {
            let envelope = try decoder.decode(KCSBridgeEnvelope.self, from: data)
            switch envelope.type {
            case "snapshot":
                guard let next = envelope.snapshot else { return }
                snapshot = next

                if next.heavyCount > 0 {
                    statusText = "🚨 大破 \(next.heavyCount)"
                } else if next.uncertain {
                    statusText = "⚠️ HP判定不明"
                } else {
                    statusText = "接続中"
                }

                if !next.choice {
                    clearGuardSession()
                }

            case "geometry":
                if let rect = envelope.rect,
                   rect.width >= 120,
                   rect.height >= 72 {
                    gameRect = rect
                }

            case "expedition":
                guard let next = envelope.expedition else { return }
                expeditionSnapshot = next
                if expeditionNotificationsEnabled {
                    syncExpeditionNotifications(next)
                }

            default:
                break
            }
        } catch {
            statusText = "Bridge解析エラー"
            print("[KCS Safety] bridge decode error:", error)
        }
    }

    func setExpeditionNotificationsEnabled(_ enabled: Bool) {
        if !enabled {
            expeditionNotificationsEnabled = false
            UserDefaults.standard.set(false, forKey: "expedition.notifications.enabled")
            removeExpeditionNotifications()
            return
        }

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            Task { @MainActor in
                guard let self else { return }
                self.expeditionNotificationsEnabled = granted
                UserDefaults.standard.set(granted, forKey: "expedition.notifications.enabled")
                if granted, let snapshot = self.expeditionSnapshot {
                    self.syncExpeditionNotifications(snapshot)
                }
            }
        }
    }

    func guardTap() {
        guard !guardPreview, !guardTemporarilyUnlocked else { return }

        let now = Date()
        guardTaps = guardTaps.filter { now.timeIntervalSince($0) <= GuardDefaults.tapWindow }
        guardTaps.append(now)
        guardTapCount = min(3, guardTaps.count)

        guard guardTaps.count >= 3 else { return }

        guardTaps.removeAll()
        guardTapCount = 0
        guardTemporarilyUnlocked = true

        relockTask?.cancel()
        relockTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled, let self else { return }
            self.guardTemporarilyUnlocked = false
        }
    }

    func previewGuard() {
        previewTask?.cancel()
        guardPreview = true

        previewTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled, let self else { return }
            self.guardPreview = false
        }
    }

    func resetGuardSettings() {
        guardWidthFraction = GuardDefaults.width
        guardHeightFraction = GuardDefaults.height
        guardCenterX = GuardDefaults.centerX
        guardCenterY = GuardDefaults.centerY
    }

    private func clearGuardSession() {
        guardTaps.removeAll()
        guardTapCount = 0
        guardTemporarilyUnlocked = false
        relockTask?.cancel()
        relockTask = nil
    }

    private func sanitizeGuardSettings() {
        guardWidthFraction = min(1, max(0.20, guardWidthFraction))
        guardHeightFraction = min(1, max(0.20, guardHeightFraction))
        guardCenterX = min(1, max(0, guardCenterX))
        guardCenterY = min(1, max(0, guardCenterY))
    }

    private func saveGuardSettings() {
        let defaults = UserDefaults.standard
        defaults.set(guardWidthFraction, forKey: "guard.width")
        defaults.set(guardHeightFraction, forKey: "guard.height")
        defaults.set(guardCenterX, forKey: "guard.centerX")
        defaults.set(guardCenterY, forKey: "guard.centerY")
    }

    private func expeditionNotificationId(for fleetId: Int) -> String {
        "kcs.expedition.fleet.\(fleetId)"
    }

    private func removeExpeditionNotifications() {
        let ids = [2, 3, 4].map(expeditionNotificationId(for:))
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }

    private func syncExpeditionNotifications(_ snapshot: KCSExpeditionSnapshot) {
        let center = UNUserNotificationCenter.current()
        let ids = [2, 3, 4].map(expeditionNotificationId(for:))
        center.removePendingNotificationRequests(withIdentifiers: ids)

        let nowMillis = Date().timeIntervalSince1970 * 1000
        for fleet in snapshot.fleets {
            guard fleet.isRunning,
                  let completion = fleet.completionTimeMillis,
                  completion > nowMillis + 1_000 else { continue }

            let seconds = max(1, (completion - nowMillis) / 1000)
            let content = UNMutableNotificationContent()
            content.title = "第\(fleet.id)艦隊が帰投します"
            content.body = fleet.missionName ?? "遠征が完了予定です"
            content.sound = .default

            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            let request = UNNotificationRequest(
                identifier: expeditionNotificationId(for: fleet.id),
                content: content,
                trigger: trigger
            )
            center.add(request)
        }
    }
}
