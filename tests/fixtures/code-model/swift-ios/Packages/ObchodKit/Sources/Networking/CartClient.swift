import Foundation
import Model

public protocol CartClient: Sendable {
    func cart() async throws -> Cart
    func removeItem(id: String) async throws -> Cart
    func createOrder(paymentMethod: PaymentMethod) async throws -> Order
}

public struct HTTPCartClient: CartClient {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func cart() async throws -> Cart {
        try await send("GET", path: "api/cart")
    }

    public func removeItem(id: String) async throws -> Cart {
        try await send("DELETE", path: "api/cart/items/\(id)")
    }

    public func createOrder(paymentMethod: PaymentMethod) async throws -> Order {
        let body = try JSONEncoder().encode(["paymentMethod": paymentMethod.rawValue])
        return try await send("POST", path: "api/orders", body: body)
    }

    private func send<Response: Decodable>(_ method: String, path: String, body: Data? = nil) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}
