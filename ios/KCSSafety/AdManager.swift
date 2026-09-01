import Foundation
import GoogleMobileAds
import UserMessagingPlatform

@MainActor
final class AdManager: ObservableObject {
    @Published private(set) var canRequestAds = false
    @Published private(set) var privacyOptionsRequired = false
    @Published private(set) var statusText = "広告準備中"

    private var mobileAdsStarted = false

    func prepareAds() async {
        let parameters = RequestParameters()

        await withCheckedContinuation { continuation in
            ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { error in
                if let error {
                    Task { @MainActor in
                        self.statusText = "同意情報取得エラー: \(error.localizedDescription)"
                    }
                }
                continuation.resume()
            }
        }

        do {
            try await ConsentForm.loadAndPresentIfRequired(from: nil)
        } catch {
            statusText = "同意画面エラー: \(error.localizedDescription)"
        }

        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        canRequestAds = ConsentInformation.shared.canRequestAds

        if canRequestAds {
            startMobileAdsIfNeeded()
            statusText = "広告利用可能"
        } else if statusText == "広告準備中" {
            statusText = "広告同意待ち"
        }
    }

    func presentPrivacyOptions() async {
        do {
            try await ConsentForm.presentPrivacyOptionsForm(from: nil)
            canRequestAds = ConsentInformation.shared.canRequestAds
            if canRequestAds {
                startMobileAdsIfNeeded()
            }
        } catch {
            statusText = "プライバシー設定エラー: \(error.localizedDescription)"
        }
    }

    private func startMobileAdsIfNeeded() {
        guard !mobileAdsStarted else { return }
        mobileAdsStarted = true
        MobileAds.shared.start()
    }
}
