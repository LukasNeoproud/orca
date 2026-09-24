import Foundation
import LocalAuthentication
import Security

final class TouchID {
    private let context = LAContext()

    init() {
        context.localizedFallbackTitle = ""
        // Each invocation requires fresh biometrics; no unlock/session cache.
        context.touchIDAuthenticationAllowableReuseDuration = 0
    }

    deinit { context.invalidate() }

    func check() throws {
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error),
              context.biometryType == .touchID else {
            throw ToolError("Touch ID is unavailable or locked out. Check enrollment and use a local login session. \(error?.localizedDescription ?? "")")
        }
    }

    func authenticate(count: Int) async throws {
        try check()
        let success = try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Read \(count) requested secret(s) from your login Keychain."
        )
        guard success else { throw ToolError("Touch ID authentication failed.") }
    }

    func authenticateEnrollment(fingerprint: String) async throws {
        try check()
        let success = try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Enroll mobile approval key SHA-256: \(fingerprint)"
        )
        guard success else { throw ToolError("Touch ID authentication failed.") }
    }

    func authenticateRevocation() async throws {
        try check()
        let success = try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Revoke the enrolled mobile approval key."
        )
        guard success else { throw ToolError("Touch ID authentication failed.") }
    }
}

final class LoginKeychain {
    private let keychain: SecKeychain

    init() throws {
        let path = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Keychains/login.keychain-db").path
        var opened: SecKeychain?
        let status = SecKeychainOpen(path, &opened)
        guard status == errSecSuccess, let opened else {
            throw keychainError(status, operation: "Open login Keychain")
        }
        keychain = opened
    }

    func read(_ request: SecretRequest) throws -> Data {
        // Explicit file keychain + search list keeps these queries on the user's
        // existing login items. Do not spawn `security`: ACLs must trust THIS binary.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: request.service,
            kSecAttrAccount as String: request.account,
            kSecUseDataProtectionKeychain as String: false,
            kSecMatchSearchList as String: [keychain],
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let value = result as? Data else {
            throw keychainError(status, operation: "Read service \(request.service), account \(request.account)")
        }
        return value
    }

    func readMobileApprovalKey() throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "local.macos-tools.touchid-keychain.mobile-approval",
            kSecAttrAccount as String: "p256-spki-v1",
            kSecUseDataProtectionKeychain as String: false,
            kSecMatchSearchList as String: [keychain],
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let value = result as? Data else {
            throw keychainError(status, operation: "Read mobile approval enrollment")
        }
        return value
    }

    func enrollMobileApprovalKey(_ publicKey: Data) throws {
        if let existing = try readMobileApprovalKey() {
            guard existing == publicKey else {
                throw ToolError("A different mobile approval key is already enrolled.")
            }
            return
        }
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "local.macos-tools.touchid-keychain.mobile-approval",
            kSecAttrAccount as String: "p256-spki-v1",
            kSecUseDataProtectionKeychain as String: false,
            kSecUseKeychain as String: keychain,
            kSecValueData as String: publicKey,
        ]
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw keychainError(status, operation: "Enroll mobile approval key")
        }
    }

    func revokeMobileApprovalKey() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "local.macos-tools.touchid-keychain.mobile-approval",
            kSecAttrAccount as String: "p256-spki-v1",
            kSecUseDataProtectionKeychain as String: false,
            kSecMatchSearchList as String: [keychain],
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw keychainError(status, operation: "Revoke mobile approval key")
        }
    }
}

private func keychainError(_ status: OSStatus, operation: String) -> ToolError {
    let message = SecCopyErrorMessageString(status, nil) as String? ?? "Unexpected Keychain result"
    return ToolError("\(operation): \(message) (OSStatus \(status)).")
}
