import Testing
@testable import Obchod

@MainActor
@Test func orderDoneReplacesTheStack() {
    let router = AppRouter()
    router.showCheckout(totalCents: 1200)

    router.showOrderDone(orderID: "42")

    #expect(router.path == [.orderDone(orderID: "42")])
}
