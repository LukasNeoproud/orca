package expo.modules.deviceapproval

import org.junit.Assert.assertThrows
import org.junit.Test

class ApprovalKeyPolicyTest {
  private val perUse = ApprovalKeyPolicy(true, 0, true, true, true)

  @Test fun acceptsKeystore2PerOperationKey() { perUse.validate() }

  @Test fun acceptsLegacyPerOperationKey() { perUse.copy(validitySeconds = -1).validate() }

  @Test fun rejectsAuthenticationWindowsAndUnknownTimeouts() {
    for (seconds in listOf(-2, 1, 30, Int.MAX_VALUE)) {
      assertThrows(IllegalStateException::class.java) {
        perUse.copy(validitySeconds = seconds).validate()
      }
    }
  }

  @Test fun rejectsMissingAuthentication() {
    assertThrows(IllegalStateException::class.java) {
      perUse.copy(authenticationRequired = false).validate()
    }
  }

  @Test fun rejectsDeviceCredentialFallback() {
    assertThrows(IllegalStateException::class.java) {
      perUse.copy(biometricOnly = false).validate()
    }
  }

  @Test fun rejectsSoftwareEnforcedAuthentication() {
    assertThrows(IllegalStateException::class.java) {
      perUse.copy(hardwareEnforced = false).validate()
    }
  }

  @Test fun rejectsKeysSurvivingBiometricEnrollment() {
    assertThrows(IllegalStateException::class.java) {
      perUse.copy(invalidatedByEnrollment = false).validate()
    }
  }
}
