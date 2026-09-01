import SwiftUI
import GoogleMobileAds

private let testBannerAdUnitID = "ca-app-pub-3940256099942544/2435281174"

struct AdBannerArea: View {
    @EnvironmentObject private var adManager: AdManager

    var body: some View {
        if adManager.canRequestAds {
            GeometryReader { proxy in
                let width = max(320, proxy.size.width)
                let adSize = largeAnchoredAdaptiveBanner(width: width)

                VStack(spacing: 2) {
                    Text("広告")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    BannerViewContainer(adSize: adSize)
                        .frame(width: adSize.size.width, height: adSize.size.height)
                }
                .frame(maxWidth: .infinity)
            }
            .frame(height: 96)
            .background(.ultraThinMaterial)
        }
    }
}

private struct BannerViewContainer: UIViewRepresentable {
    let adSize: AdSize

    func makeUIView(context: Context) -> BannerView {
        let banner = BannerView(adSize: adSize)
        banner.adUnitID = testBannerAdUnitID
        banner.rootViewController = Self.activeRootViewController()
        banner.load(Request())
        return banner
    }

    func updateUIView(_ uiView: BannerView, context: Context) {
        if uiView.adSize.size != adSize.size {
            uiView.adSize = adSize
            uiView.rootViewController = Self.activeRootViewController()
            uiView.load(Request())
        }
    }

    private static func activeRootViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        return scene?.windows.first { $0.isKeyWindow }?.rootViewController
    }
}
