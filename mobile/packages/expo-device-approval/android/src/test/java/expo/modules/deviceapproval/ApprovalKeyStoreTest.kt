package expo.modules.deviceapproval

import android.os.Build
import android.security.keystore.KeyProperties
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApprovalKeyStoreTest {
  @Test fun api30UsesHardwareFlag() {
    assertEquals("trusted_environment", ApprovalKeyStore.securityLevelFor(Build.VERSION_CODES.R, true, null))
    assertThrows(IllegalStateException::class.java) {
      ApprovalKeyStore.securityLevelFor(Build.VERSION_CODES.R, false, null)
    }
  }

  @Test fun api31PreservesStrongBoxAndTrustedEnvironmentLevels() {
    assertEquals("strongbox", ApprovalKeyStore.securityLevelFor(
      Build.VERSION_CODES.S,
      true,
      KeyProperties.SECURITY_LEVEL_STRONGBOX,
    ))
    assertEquals("trusted_environment", ApprovalKeyStore.securityLevelFor(
      Build.VERSION_CODES.S,
      true,
      KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT,
    ))
  }

  @Test fun api31RejectsSoftwareLevelEvenWhenLegacyHardwareFlagIsTrue() {
    assertThrows(IllegalStateException::class.java) {
      ApprovalKeyStore.securityLevelFor(Build.VERSION_CODES.S, true, KeyProperties.SECURITY_LEVEL_SOFTWARE)
    }
  }
}
