import Foundation

public struct CartItem: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let quantity: Int
    public let unitPriceCents: Int

    public init(id: String, name: String, quantity: Int, unitPriceCents: Int) {
        self.id = id
        self.name = name
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
    }

    public var totalCents: Int { quantity * unitPriceCents }
}

public struct Cart: Codable, Equatable, Sendable {
    public var items: [CartItem]

    public init(items: [CartItem]) {
        self.items = items
    }

    public var totalCents: Int { items.reduce(0) { $0 + $1.totalCents } }
    public var isEmpty: Bool { items.isEmpty }
}
