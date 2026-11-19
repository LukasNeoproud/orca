import ObchodAnalytics
import SwiftUI

@main
struct ObchodApp: App {
    @State private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView(router: router)
                .onAppear { Analytics.shared.track("app_opened") }
        }
    }
}
