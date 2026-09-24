package expo.modules.deviceapproval

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoDeviceApprovalModule : Module() {
  private val lock = Any()
  private var pending: PendingSign? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoDeviceApproval")

    AsyncFunction("enroll") { hostId: String, attestationChallengeBase64: String, promise: Promise ->
      try {
        val alias = ApprovalKeyStore.aliasFor(hostId)
        val challenge = ApprovalKeyStore.decodeAttestationChallenge(attestationChallengeBase64)
        val result = synchronized(lock) {
          check(pending == null) { "Approval prompt is active" }
          ApprovalKeyStore.enroll(alias, challenge)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("ENROLL_FAILED", error.message ?: "Enrollment failed", error)
      }
    }

    AsyncFunction("getPublicInfo") { hostId: String, promise: Promise ->
      try {
        val alias = ApprovalKeyStore.aliasFor(hostId)
        val result = synchronized(lock) { ApprovalKeyStore.publicInfo(alias) }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("KEY_UNAVAILABLE", error.message ?: "Approval key unavailable", error)
      }
    }

    AsyncFunction("sign") { hostId: String, canonicalChallengeUtf8: String, promise: Promise ->
      try {
        val alias = ApprovalKeyStore.aliasFor(hostId)
        val challenge = ApprovalKeyStore.challengeBytes(canonicalChallengeUtf8)
        val activity = appContext.currentActivity as? FragmentActivity
          ?: error("An active FragmentActivity is required")
        check(BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
          BiometricManager.BIOMETRIC_SUCCESS) { "Strong biometric authentication is unavailable" }
        val signature = synchronized(lock) {
          check(pending == null) { "Approval prompt is active" }
          ApprovalKeyStore.signingSignature(alias).also {
            pending = PendingSign(promise, activity)
          }
        }
        activity.runOnUiThread {
          val request = synchronized(lock) { pending?.takeIf { it.promise === promise } }
          if (request == null) return@runOnUiThread
          try {
            val prompt = BiometricPrompt(activity, activity.mainExecutor,
              object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                  finish(request, "AUTH_CANCELLED", "Biometric authentication ended")
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                  try {
                    val authorized = result.cryptoObject?.signature
                      ?: error("Biometric signature was not authorized")
                    check(authorized === signature) { "Unexpected biometric signature" }
                    synchronized(lock) { check(pending === request) { "Approval was cancelled" } }
                    authorized.update(challenge)
                    val signed = authorized.sign()
                    finish(request, mapOf("signatureDerBase64" to ApprovalKeyStore.encode(signed)))
                  } catch (error: Exception) {
                    finish(request, "SIGN_FAILED", error.message ?: "Signing failed")
                  }
                }
              })
            synchronized(lock) {
              if (pending === request) request.prompt = prompt
              else return@runOnUiThread
            }
            prompt.authenticate(
              BiometricPrompt.PromptInfo.Builder()
                .setTitle("Approve remote request")
                .setSubtitle("Confirm with your biometric")
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build(),
              BiometricPrompt.CryptoObject(signature)
            )
          } catch (error: Exception) {
            finish(request, "AUTH_UNAVAILABLE", error.message ?: "Biometric prompt unavailable")
          }
        }
      } catch (error: Exception) {
        promise.reject("SIGN_UNAVAILABLE", error.message ?: "Signing unavailable", error)
      }
    }

    AsyncFunction("deleteKey") { hostId: String, promise: Promise ->
      try {
        val alias = ApprovalKeyStore.aliasFor(hostId)
        synchronized(lock) {
          check(pending == null) { "Approval prompt is active" }
          ApprovalKeyStore.delete(alias)
        }
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("DELETE_FAILED", error.message ?: "Key deletion failed", error)
      }
    }

    OnActivityDestroys { cancelPending() }
    OnDestroy { cancelPending() }
  }

  private fun finish(request: PendingSign, result: Map<String, String>) {
    synchronized(lock) {
      if (pending !== request) return
      pending = null
    }
    request.promise.resolve(result)
  }

  private fun finish(request: PendingSign, code: String, message: String) {
    synchronized(lock) {
      if (pending !== request) return
      pending = null
    }
    request.promise.reject(code, message, null)
  }

  private fun cancelPending() {
    val request = synchronized(lock) { pending.also { pending = null } } ?: return
    request.activity.runOnUiThread { request.prompt?.cancelAuthentication() }
    request.promise.reject("AUTH_CANCELLED", "Activity was destroyed", null)
  }

  private class PendingSign(val promise: Promise, val activity: FragmentActivity) {
    var prompt: BiometricPrompt? = null
  }
}
