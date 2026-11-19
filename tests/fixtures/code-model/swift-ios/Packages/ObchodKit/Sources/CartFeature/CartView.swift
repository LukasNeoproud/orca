import DesignSystem
import SwiftUI

public struct CartView: View {
    @State private var viewModel: CartViewModel

    public init(viewModel: CartViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    public var body: some View {
        List {
            if viewModel.items.isEmpty {
                Text("cart_empty")
            } else {
                ForEach(viewModel.items) { item in
                    Text(item.name)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task { await viewModel.send(.removeItem(id: item.id)) }
                            } label: {
                                Text("cart_remove")
                            }
                        }
                }
                Text("cart_total \(formatPrice(cents: viewModel.totalCents))")
            }
            PrimaryButton("cart_checkout") {
                Task { await viewModel.send(.checkout) }
            }
        }
        .navigationTitle(Text("cart_title"))
        .task { await viewModel.send(.refresh) }
    }
}
