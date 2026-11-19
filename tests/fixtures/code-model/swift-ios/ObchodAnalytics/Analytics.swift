import Foundation

public final class Analytics: @unchecked Sendable {
    public static let shared = Analytics()

    private let lock = NSLock()
    private var events: [String] = []

    public func track(_ name: String) {
        lock.lock()
        defer { lock.unlock() }
        events.append(name)
    }

    public var recorded: [String] {
        lock.lock()
        defer { lock.unlock() }
        return events
    }
}
