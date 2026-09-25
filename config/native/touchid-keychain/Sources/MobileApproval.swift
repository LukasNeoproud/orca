import CryptoKit
import Darwin
import Foundation
import Security

enum MobileApproval {
    static let service = "cz.neoproud.orca.dev.private-distribution"
    static let accounts = [
        "android-keystore-base64", "android-keystore-password", "android-key-alias",
        "android-key-password", "firebase-service-account-json",
    ]
    static let applicationID = "1:100414786379:android:410ca57940be633c0676ce"
    static let packageName = "cz.neoproud.orca.dev"
    static let maximumChallengeBytes = 16_384

    static func validateRequests(_ requests: [SecretRequest]) throws {
        guard (1...32).contains(requests.count) else {
            throw ToolError("Mobile approval requires 1 to 32 service/account pairs.")
        }
        guard Set(requests.map { "\($0.service)\0\($0.account)" }).count == requests.count else {
            throw ToolError("Mobile approval service/account pairs must be unique.")
        }
        for request in requests {
            guard validLabel(request.service), validLabel(request.account) else {
                throw ToolError("Mobile approval service and account must be 1 to 256 UTF-8 bytes without control or formatting characters.")
            }
        }
    }

    private static func validLabel(_ value: String) -> Bool {
        guard !value.isEmpty, value.utf8.count <= 256 else { return false }
        return value.unicodeScalars.allSatisfy { scalar in
            switch scalar.properties.generalCategory {
            case .control, .format, .lineSeparator, .paragraphSeparator:
                return false
            default:
                return true
            }
        }
    }

    static func fingerprint(_ key: Data) -> String {
        SHA256.hash(data: key).map { String(format: "%02x", $0) }.joined()
    }

    static func parsePublicKey(_ encoded: String) throws -> Data {
        guard let data = Data(base64Encoded: encoded),
              let key = try? P256.Signing.PublicKey(derRepresentation: data),
              key.derRepresentation == data else {
            throw ToolError("Expected a canonical DER P-256 public key in base64.")
        }
        return data
    }

    static func approve(contextPath: String?, requests: [SecretRequest], keychain: LoginKeychain) async throws {
        try validateRequests(requests)
        if contextPath != nil,
           requests != accounts.map({ SecretRequest(service: service, account: $0) }) {
            throw ToolError("Private Android distribution requires its five fixed service/account pairs.")
        }
        guard let enrolledKey = try keychain.readMobileApprovalKey() else {
            throw ToolError("No mobile approval key is enrolled.")
        }
        _ = try P256.Signing.PublicKey(derRepresentation: enrolledKey)
        let operation = try operation(contextPath: contextPath)
        let mailbox = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/orca/device-approvals", isDirectory: true)
        let pending = mailbox.appendingPathComponent("pending", isDirectory: true)
        let responses = mailbox.appendingPathComponent("responses", isDirectory: true)
        let config = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config", isDirectory: true)
        try prepareDirectory(config, privateMode: false)
        try prepareDirectory(config.appendingPathComponent("orca", isDirectory: true), privateMode: false)
        try prepareDirectory(mailbox, privateMode: true)
        try prepareDirectory(pending, privateMode: true)
        try prepareDirectory(responses, privateMode: true)
        let requestID = randomHex(16)
        let createdAt = Int64(Date().timeIntervalSince1970 * 1_000)
        let expiresAt = createdAt + 120_000
        let challenge = try makeChallenge(
            requestID: requestID, nonce: randomBase64URL(32), keyID: fingerprint(enrolledKey),
            createdAt: createdAt, expiresAt: expiresAt, operation: operation, requests: requests)
        let pendingFile = pending.appendingPathComponent("\(requestID).json")
        let responseFile = responses.appendingPathComponent("\(requestID).json")
        try createOwnerOnlyFile(pendingFile, contents: challenge)
        defer {
            try? FileManager.default.removeItem(at: pendingFile)
            try? FileManager.default.removeItem(at: responseFile)
        }
        var signature: Data?
        while validWindow(createdAt: createdAt, expiresAt: expiresAt,
                          now: Int64(Date().timeIntervalSince1970 * 1_000)) {
            if FileManager.default.fileExists(atPath: responseFile.path) {
                let responseData = try consumeResponse(responseFile)
                guard let response = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
                      response.count == 3,
                      response["version"] as? Int == 1,
                      response["requestId"] as? String == requestID,
                      let encoded = response["signatureDerBase64"] as? String,
                      let bytes = Data(base64Encoded: encoded), bytes.count <= 144 else {
                    throw ToolError("Invalid mobile approval response.")
                }
                signature = bytes
                break
            }
            try await Task.sleep(for: .milliseconds(200))
        }
        guard validWindow(createdAt: createdAt, expiresAt: expiresAt,
                          now: Int64(Date().timeIntervalSince1970 * 1_000)),
              let signature, validSignature(signature, challenge: challenge, publicKey: enrolledKey) else {
            throw ToolError("Mobile approval was not received or its signature was invalid.")
        }
        try FileManager.default.removeItem(at: pendingFile)
        guard try keychain.readMobileApprovalKey() == enrolledKey else {
            throw ToolError("Mobile approval enrollment changed during the request.")
        }
    }

    static func operation(contextPath: String?) throws -> [String: Any] {
        guard let contextPath else { return ["kind": "keychain-read"] }
        return try parseOperation(try readOwnerOnlyFile(URL(fileURLWithPath: contextPath)))
    }

    static func makeChallenge(
        requestID: String, nonce: String, keyID: String, createdAt: Int64, expiresAt: Int64,
        operation: [String: Any], requests: [SecretRequest]
    ) throws -> Data {
        try validateRequests(requests)
        let requesterPID = Int(getpid())
        guard requesterPID > 0 else { throw ToolError("Cannot identify mobile approval requester.") }
        let payload: [String: Any] = [
            "version": 1,
            "requestId": requestID,
            "requesterPid": requesterPID,
            "nonce": nonce,
            "keyId": keyID,
            "createdAt": createdAt,
            "expiresAt": expiresAt,
            "operation": operation,
            "requests": requests.map { ["service": $0.service, "account": $0.account] },
        ]
        let challenge = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        guard challenge.count <= maximumChallengeBytes else {
            throw ToolError("Mobile approval challenge exceeds 16 KB.")
        }
        return challenge
    }

    static func validSignature(_ signature: Data, challenge: Data, publicKey: Data) -> Bool {
        guard let key = try? P256.Signing.PublicKey(derRepresentation: publicKey),
              let parsed = try? P256.Signing.ECDSASignature(derRepresentation: signature) else {
            return false
        }
        return key.isValidSignature(parsed, for: challenge)
    }

    static func validWindow(createdAt: Int64, expiresAt: Int64, now: Int64) -> Bool {
        createdAt > 0 && expiresAt > createdAt && expiresAt - createdAt <= 120_000 &&
            now >= createdAt - 5_000 && now <= expiresAt
    }

    static func consumeResponse(_ url: URL) throws -> Data {
        let data = try readOwnerOnlyFile(url)
        try FileManager.default.removeItem(at: url)
        return data
    }

    private static func parseOperation(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              value.count == 7,
              value["kind"] as? String == "private-android-distribution",
              let mode = value["mode"] as? String, ["build", "publish"].contains(mode),
              let commit = value["commit"] as? String,
              matches(commit, "^[0-9a-f]{40}([0-9a-f]{24})?$"),
              value["firebaseAppId"] as? String == applicationID,
              value["packageName"] as? String == packageName,
              let groups = value["groups"] as? [String],
              groups.count <= 20,
              groups == Array(Set(groups)).sorted(),
              groups.allSatisfy({ $0.count <= 100 && matches($0, "^[A-Za-z0-9_-]+$") }),
              (mode == "publish" ? !groups.isEmpty : groups.isEmpty),
              let notesHash = value["releaseNotesSha256"] as? String,
              matches(notesHash, "^[0-9a-f]{64}$"),
              (mode == "publish" || notesHash == fingerprint(Data())) else {
            throw ToolError("Invalid private Android mobile approval operation.")
        }
        return value
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func randomHex(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            fatalError("System randomness unavailable")
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private static func randomBase64URL(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            fatalError("System randomness unavailable")
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func prepareDirectory(_ url: URL, privateMode: Bool) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700])
        var info = stat()
        guard lstat(url.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFDIR,
              info.st_uid == getuid(),
              (info.st_mode & (privateMode ? 0o077 : 0o022)) == 0 else {
            throw ToolError("Mobile approval mailbox path must be owned by you and not writable by others.")
        }
    }

    private static func createOwnerOnlyFile(_ url: URL, contents: Data) throws {
        let fd = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ToolError("Cannot create mobile approval request.") }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        try file.write(contentsOf: contents)
        try file.close()
    }

    private static func readOwnerOnlyFile(_ url: URL) throws -> Data {
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw ToolError("Cannot read mobile approval file.") }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_uid == getuid(), (info.st_mode & 0o077) == 0,
              info.st_size <= 16_384 else {
            throw ToolError("Mobile approval file must be a small owner-only regular file.")
        }
        let data = try file.readToEnd() ?? Data()
        try file.close()
        guard data.count <= 16_384 else { throw ToolError("Mobile approval file is too large.") }
        return data
    }
}
