import Foundation
import Model
import Networking
import Observation

public enum CartAction: Equatable {
    case refresh
    case removeItem(id: String)
    case checkout
}

@MainActor
@Observable
public final class CartViewModel {
    public private(set) var items: [CartItem] = []
    public private(set) var totalCents = 0
    public private(set) var isLoading = true

    private let client: any CartClient
    private let onCheckout: () -> Void

    public init(client: any CartClient, onCheckout: @escaping () -> Void) {
        self.client = client
        self.onCheckout = onCheckout
    }

    public func send(_ action: CartAction) async {
        switch action {
        case .refresh:
            await load()
        case .removeItem(let id):
            await remove(id: id)
        case .checkout:
            if !items.isEmpty {
                onCheckout()
            }
        }
    }

    private func load() async {
        guard let cart = try? await client.cart() else {
            isLoading = false
            return
        }
        apply(cart)
    }

    private func remove(id: String) async {
        if let cart = try? await client.removeItem(id: id) {
            apply(cart)
        }
    }

    private func apply(_ cart: Cart) {
        items = cart.items
        totalCents = cart.totalCents
        isLoading = false
    }
}

public func formatPrice(cents: Int) -> String {
    String(format: "%d.%02d", cents / 100, cents % 100)
}
