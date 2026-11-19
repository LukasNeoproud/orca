import CartFeature
import CheckoutFeature
import Foundation
import Networking
import Observation
import SwiftUI

enum Route: Hashable {
    case checkout(totalCents: Int)
    case orderDone(orderID: String)
}

@MainActor
@Observable
final class AppRouter {
    var path: [Route] = []

    func showCheckout(totalCents: Int) {
        path.append(.checkout(totalCents: totalCents))
    }

    func showOrderDone(orderID: String) {
        path = [.orderDone(orderID: orderID)]
    }

    func popToRoot() {
        path.removeAll()
    }
}

struct RootView: View {
    @Bindable var router: AppRouter
    private let client = HTTPCartClient(baseURL: URL(string: "https://obchod.example.com/")!)

    var body: some View {
        NavigationStack(path: $router.path) {
            CartView(viewModel: CartViewModel(client: client) { router.showCheckout(totalCents: 0) })
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .checkout(let totalCents):
                        CheckoutView(
                            viewModel: CheckoutViewModel(client: client) { order in router.showOrderDone(orderID: order.id) },
                            totalCents: totalCents
                        )
                    case .orderDone(let orderID):
                        OrderDoneView(orderID: orderID, onClose: router.popToRoot)
                    }
                }
        }
    }
}

struct OrderDoneView: View {
    let orderID: String
    let onClose: () -> Void

    var body: some View {
        VStack {
            Text("checkout_done \(orderID)")
            Button("common_close", action: onClose)
        }
    }
}
