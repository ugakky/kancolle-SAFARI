import SwiftUI

@main
struct KCSSafetyApp: App {
    @StateObject private var browserModel = BrowserModel()
    @StateObject private var adManager = AdManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(browserModel)
                .environmentObject(adManager)
                .task {
                    await adManager.prepareAds()
                }
        }
    }
}
