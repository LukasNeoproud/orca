import Foundation
import Model
import Networking
import Observation

public enum CheckoutAction: Equatable {
    case selectPayment(PaymentMethod)
    case pay
}

@MainActor
@Observable
public final class CheckoutViewModel {
    public private(set) var paymentMethod: PaymentMethod = .card
    public private(set) var isPlacingOrder = false

    private let client: any CartClient
    private let onOrderPlaced: (Order) -> Void

    public init(client: any CartClient, onOrderPlaced: @escaping (Order) -> Void) {
        self.client = client
        self.onOrderPlaced = onOrderPlaced
    }

    public func send(_ action: CheckoutAction) async {
        switch action {
        case .selectPayment(let method):
            paymentMethod = method
        case .pay:
            await pay()
        }
    }

    private func pay() async {
        guard !isPlacingOrder else { return }
        isPlacingOrder = true
        defer { isPlacingOrder = false }
        if let order = try? await client.createOrder(paymentMethod: paymentMethod) {
            onOrderPlaced(order)
        }
    }
}
