import Foundation

public enum PaymentMethod: String, Codable, CaseIterable, Sendable {
    case card
    case cashOnDelivery
}

public struct Order: Codable, Equatable, Sendable {
    public let id: String
    public let totalCents: Int
    public let paymentMethod: PaymentMethod
}
