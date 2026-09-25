package expo.modules.deviceapproval

internal data class ApprovalKeyPolicy(
  val authenticationRequired: Boolean,
  val validitySeconds: Int,
  val biometricOnly: Boolean,
  val hardwareEnforced: Boolean,
  val invalidatedByEnrollment: Boolean,
) {
  fun validate() {
    check(authenticationRequired) { "Approval key must require authentication" }
    // Keystore2 reports 0 for per-use keys; older KeyInfo implementations report -1.
    check(validitySeconds == 0 || validitySeconds == -1) {
      "Approval key must require authentication for every signature (timeout=$validitySeconds)"
    }
    check(biometricOnly) { "Approval key must allow strong biometrics only" }
    check(hardwareEnforced) { "Approval key authentication must be hardware enforced" }
    check(invalidatedByEnrollment) { "Approval key must be invalidated when biometrics change" }
  }
}
