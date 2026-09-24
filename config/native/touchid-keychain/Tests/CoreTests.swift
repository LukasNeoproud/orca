import CryptoKit
import Foundation

@main
struct CoreTests {
    static func main() async throws {
        try await run()
    }

    nonisolated static func run() async throws {
        let first = SecretRequest(service: "service", account: "first")
        let second = SecretRequest(service: "service", account: "second")
        let options = ReadOptions(requests: [first, second], format: .nul)
        var events: [String] = []
        let output = try await retrieve(options, authenticate: {
            events.append("auth")
        }, read: { request in
            events.append(request.account)
            return Data((request == first ? "quotes ' \" $() `x`\n\n" : "čeština").utf8)
        })
        precondition(events == ["auth", "first", "second"], "Authenticate once, before all reads")
        precondition(output == Data("quotes ' \" $() `x`\n\n\0čeština\0".utf8))

        events = []
        do {
            _ = try await retrieve(options, authenticate: {
                throw ToolError("cancelled")
            }, read: { _ in
                events.append("read")
                return Data()
            })
            preconditionFailure("Cancelled authentication must throw")
        } catch { precondition(events.isEmpty, "Denied auth must never read Keychain") }

        var published: Data?
        do {
            published = try await retrieve(options, authenticate: {}, read: { request in
                if request == second { throw ToolError("denied item") }
                return Data("first secret".utf8)
            })
            preconditionFailure("A denied item must fail the entire batch")
        } catch { precondition(published == nil, "Never publish partial results") }

        for invalid in [Data([0]), Data([0xff])] {
            do {
                _ = try await retrieve(options, authenticate: {}, read: { _ in invalid })
                preconditionFailure("NUL framing must reject NUL and non-UTF8")
            } catch {}
        }
        let raw = try await retrieve(ReadOptions(requests: [first], format: .raw),
                                     authenticate: {}, read: { _ in Data([0, 0xff, 10]) })
        precondition(raw == Data([0, 0xff, 10]), "Raw mode must preserve bytes")
        let json = try await retrieve(ReadOptions(requests: [first], format: .json),
                                      authenticate: {}, read: { _ in Data("a\0\n\"b".utf8) })
        let decoded = try JSONSerialization.jsonObject(with: json) as! [[String: String]]
        precondition(decoded == [["service": "service", "account": "first", "value": "a\0\n\"b"]])
        events = []
        let discarded = try await retrieve(ReadOptions(requests: [first, second], format: .discard),
                                            authenticate: { events.append("auth") }, read: { request in
            events.append(request.account)
            return Data("never print this".utf8)
        })
        precondition(discarded.isEmpty && events == ["auth", "first", "second"])
        let empty = try await retrieve(options, authenticate: {}, read: { _ in Data() })
        precondition(empty == Data([0, 0]), "Empty secrets still have records")

        for arguments in [["get"], ["get", "service"], ["get", "s", "a", "s", "b"],
                          ["get", "--null", "s", ""], ["unknown"], ["check", "extra"]] {
            do {
                _ = try Command.parse(arguments)
                preconditionFailure("Invalid arguments accepted: \(arguments)")
            } catch {}
        }
        guard case .read(let parsed) = try Command.parse(["get", "--null", "service", "first", "service", "second"]) else {
            preconditionFailure("Expected read command")
        }
        precondition(parsed.requests == [first, second] && parsed.format == .nul)
        guard case .read(let verify) = try Command.parse(["verify", "service", "first"]) else {
            preconditionFailure("Expected verify command")
        }
        precondition(verify.format == .discard)
        guard case .mobileRead(let mobile, let contextPath) = try Command.parse([
            "get-mobile", "--json", "--context-file", "/tmp/context.json", "service", "first"
        ]) else { preconditionFailure("Expected mobile read command") }
        precondition(mobile.requests == [first] && contextPath == "/tmp/context.json")
        let signingKey = P256.Signing.PrivateKey()
        let unrelatedKey = P256.Signing.PrivateKey()
        let publicKey = signingKey.publicKey.derRepresentation
        let challenge = Data("one exact request".utf8)
        let signature = try signingKey.signature(for: challenge).derRepresentation
        precondition(MobileApproval.validSignature(signature, challenge: challenge, publicKey: publicKey))
        precondition(!MobileApproval.validSignature(signature, challenge: Data("changed".utf8), publicKey: publicKey))
        precondition(!MobileApproval.validSignature(signature, challenge: challenge,
            publicKey: unrelatedKey.publicKey.derRepresentation))
        precondition(MobileApproval.validWindow(createdAt: 1_000, expiresAt: 121_000, now: 121_000))
        precondition(!MobileApproval.validWindow(createdAt: 1_000, expiresAt: 121_000, now: 121_001))
        precondition(!MobileApproval.validWindow(createdAt: 1_000, expiresAt: 121_001, now: 2_000))
        let responseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("orca-approval-test-\(UUID().uuidString)")
        let responseBytes = Data("approved".utf8)
        guard FileManager.default.createFile(atPath: responseURL.path, contents: responseBytes,
                                             attributes: [.posixPermissions: 0o600]) else {
            preconditionFailure("Cannot prepare one-use response")
        }
        let consumed = try MobileApproval.consumeResponse(responseURL)
        precondition(consumed == responseBytes)
        do {
            _ = try MobileApproval.consumeResponse(responseURL)
            preconditionFailure("Consumed response was reused")
        } catch {}
        let decodedPublicKey = try MobileApproval.parsePublicKey(publicKey.base64EncodedString())
        precondition(decodedPublicKey == publicKey)
        print("PASS: authentication ordering/cancellation, atomic batch failure, framing, binary/JSON, verify, parsing")
    }
}
