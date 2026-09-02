import SwiftUI

@main
struct KCSSafetyApp: App {
    @StateObject private var browserModel = BrowserModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(browserModel)
        }
    }
}
