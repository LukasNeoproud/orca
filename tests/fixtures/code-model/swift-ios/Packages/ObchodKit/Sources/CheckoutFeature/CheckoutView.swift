import CartFeature
import DesignSystem
import Model
import SwiftUI

public struct CheckoutView: View {
    @State private var viewModel: CheckoutViewModel
    private let totalCents: Int

    public init(viewModel: CheckoutViewModel, totalCents: Int) {
        _viewModel = State(initialValue: viewModel)
        self.totalCents = totalCents
    }

    public var body: some View {
        Form {
            Picker(selection: paymentBinding) {
                ForEach(PaymentMethod.allCases, id: \.self) { method in
                    Text(method.rawValue).tag(method)
                }
            } label: {
                Text("checkout_payment")
            }
            PrimaryButton("checkout_pay \(formatPrice(cents: totalCents))") {
                Task { await viewModel.send(.pay) }
            }
            .disabled(viewModel.isPlacingOrder)
        }
        .navigationTitle(Text("checkout_title"))
    }

    private var paymentBinding: Binding<PaymentMethod> {
        Binding(
            get: { viewModel.paymentMethod },
            set: { method in Task { await viewModel.send(.selectPayment(method)) } }
        )
    }
}
