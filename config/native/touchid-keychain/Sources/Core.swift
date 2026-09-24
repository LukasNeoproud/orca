import Foundation

struct ToolError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

struct SecretRequest: Equatable, Sendable {
    let service: String
    let account: String
}

enum OutputFormat: Sendable { case raw, json, nul, discard }

struct ReadOptions: Sendable {
    let requests: [SecretRequest]
    let format: OutputFormat
}

enum Command {
    case help, check
    case read(ReadOptions)
    case mobileRead(ReadOptions, contextPath: String)
    case enrollMobile(publicKey: String), revokeMobile

    static func parse(_ arguments: [String]) throws -> Command {
        if arguments == ["--help"] || arguments == ["help"] || arguments.isEmpty { return .help }
        if arguments == ["check"] { return .check }
        if arguments.count == 2, arguments[0] == "enroll-mobile" {
            return .enrollMobile(publicKey: arguments[1])
        }
        if arguments == ["revoke-mobile"] { return .revokeMobile }
        if arguments.count >= 6, arguments[0] == "get-mobile",
           arguments[1] == "--json", arguments[2] == "--context-file",
           !arguments[3].isEmpty {
            let requests = try parseRequests(Array(arguments.dropFirst(4)))
            return .mobileRead(ReadOptions(requests: requests, format: .json), contextPath: arguments[3])
        }
        guard let verb = arguments.first, verb == "get" || verb == "verify" else {
            throw ToolError("Expected get, get-mobile, verify, enroll-mobile, check, or --help.")
        }
        var remaining = Array(arguments.dropFirst())
        var format: OutputFormat = verb == "verify" ? .discard : .raw
        if verb == "get", let option = remaining.first, option == "--null" || option == "--json" {
            format = option == "--null" ? .nul : .json
            remaining.removeFirst()
        }
        if remaining.first == "--" { remaining.removeFirst() }
        let requests = try parseRequests(remaining)
        if format == .raw && remaining.count != 2 {
            throw ToolError("Multiple secrets require --null or --json (or use verify).")
        }
        return .read(ReadOptions(requests: requests, format: format))
    }
}

private func parseRequests(_ arguments: [String]) throws -> [SecretRequest] {
    guard !arguments.isEmpty, arguments.count % 2 == 0 else {
        throw ToolError("Supply one or more SERVICE ACCOUNT pairs.")
    }
    guard arguments.allSatisfy({ !$0.isEmpty && !$0.contains("\0") }) else {
        throw ToolError("Service and account must be nonempty and contain no NUL bytes.")
    }
    return stride(from: 0, to: arguments.count, by: 2).map {
        SecretRequest(service: arguments[$0], account: arguments[$0 + 1])
    }
}

// Authentication precedes every read. Buffer the entire batch so a later denied
// item cannot leave earlier secrets on stdout, even when a caller uses fallback.
func retrieve(
    _ options: ReadOptions,
    authenticate: () async throws -> Void,
    read: (SecretRequest) throws -> Data
) async throws -> Data {
    try await authenticate()
    let values = try options.requests.map(read)
    switch options.format {
    case .discard:
        return Data()
    case .raw:
        return values[0]
    case .nul:
        var output = Data()
        for value in values {
            guard !value.contains(0), String(data: value, encoding: .utf8) != nil else {
                throw ToolError("--null requires UTF-8 values without NUL bytes; use --json for UTF-8 containing NUL.")
            }
            output.append(value)
            output.append(0)
        }
        return output
    case .json:
        let records = try zip(options.requests, values).map { request, data -> [String: String] in
            guard let value = String(data: data, encoding: .utf8) else {
                throw ToolError("--json requires UTF-8 values; retrieve binary items individually with get.")
            }
            return ["service": request.service, "account": request.account, "value": value]
        }
        var output = try JSONSerialization.data(withJSONObject: records, options: [.sortedKeys])
        output.append(10)
        return output
    }
}
