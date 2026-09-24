import Darwin
import Foundation

@main
struct TouchIDKeychain {
    static func main() async {
        do {
            switch try Command.parse(Array(CommandLine.arguments.dropFirst())) {
            case .help:
                print("""
                Usage:
                  touchid-keychain get SERVICE ACCOUNT
                  touchid-keychain get --null SERVICE ACCOUNT [SERVICE ACCOUNT ...]
                  touchid-keychain get --json SERVICE ACCOUNT [SERVICE ACCOUNT ...]
                  touchid-keychain verify SERVICE ACCOUNT [SERVICE ACCOUNT ...]
                  touchid-keychain get-mobile --json --context-file PATH SERVICE ACCOUNT ...
                  touchid-keychain enroll-mobile P256_SPKI_DER_BASE64
                  touchid-keychain revoke-mobile
                  touchid-keychain check

                Reads existing generic passwords from ~/Library/Keychains/login.keychain-db.
                Each get/verify authenticates once with Touch ID before reading any item.
                get: exact bytes for one item; --null: NUL-delimited UTF-8 values;
                --json: an array of service/account/value objects. No partial batch output.
                verify: read and discard all values (for first-use Always Allow approval).
                check: check Touch ID availability without a prompt or reading Keychain.
                Errors go to stderr; failures exit nonzero. There is no auth cache or bypass.
                """)
            case .check:
                try TouchID().check()
                print("Touch ID is available. No authentication or secret read was performed.")
            case .enrollMobile(let encoded):
                let key = try MobileApproval.parsePublicKey(encoded)
                try await TouchID().authenticateEnrollment(fingerprint: MobileApproval.fingerprint(key))
                try LoginKeychain().enrollMobileApprovalKey(key)
                print("Mobile approval key enrolled: \(MobileApproval.fingerprint(key))")
            case .revokeMobile:
                try await TouchID().authenticateRevocation()
                try LoginKeychain().revokeMobileApprovalKey()
                print("Mobile approval key revoked.")
            case .mobileRead(let options, let contextPath):
                let output = try await Task.detached {
                    let keychain = try LoginKeychain()
                    guard let originalKey = try keychain.readMobileApprovalKey() else {
                        throw ToolError("No mobile approval key is enrolled.")
                    }
                    let output = try await retrieve(options, authenticate: {
                        try await MobileApproval.approve(
                            contextPath: contextPath, requests: options.requests, keychain: keychain)
                    }, read: { request in
                        guard try keychain.readMobileApprovalKey() == originalKey else {
                            throw ToolError("Mobile approval enrollment changed during the request.")
                        }
                        return try keychain.read(request)
                    })
                    guard try keychain.readMobileApprovalKey() == originalKey else {
                        throw ToolError("Mobile approval enrollment changed during the request.")
                    }
                    return output
                }.value
                try FileHandle.standardOutput.write(contentsOf: output)
            case .read(let options):
                // SecItem may block while macOS asks for initial ACL approval.
                // Keep those calls off the main actor used by LocalAuthentication.
                let output = try await Task.detached {
                    let authentication = TouchID()
                    var keychain: LoginKeychain?
                    return try await retrieve(options, authenticate: {
                        try await authentication.authenticate(count: options.requests.count)
                    }, read: { request in
                        if keychain == nil { keychain = try LoginKeychain() }
                        return try keychain!.read(request)
                    })
                }.value
                try FileHandle.standardOutput.write(contentsOf: output)
            }
        } catch {
            // Never include a secret value in errors. LocalAuthentication errors
            // report only the reason that authentication was denied/unavailable.
            let message = (error as? ToolError)?.description ?? error.localizedDescription
            try? FileHandle.standardError.write(contentsOf: Data("touchid-keychain: \(message)\n".utf8))
            exit(1)
        }
    }
}
