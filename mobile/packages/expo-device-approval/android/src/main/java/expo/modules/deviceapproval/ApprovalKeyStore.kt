package expo.modules.deviceapproval

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec

internal object ApprovalKeyStore {
  private const val PROVIDER = "AndroidKeyStore"
  private val hostIdPattern = Regex("[A-Za-z0-9._:-]{1,128}")
  private val base64Pattern = Regex("[A-Za-z0-9+/]+={0,2}")

  fun aliasFor(hostId: String): String {
    requireSupported()
    require(hostIdPattern.matches(hostId)) { "Invalid host ID" }
    val digest = MessageDigest.getInstance("SHA-256")
      .digest(hostId.toByteArray(StandardCharsets.US_ASCII))
    return "orca.remote-approval." + digest.joinToString("") { "%02x".format(it) }
  }

  fun decodeAttestationChallenge(value: String): ByteArray {
    require(value.length in 24..88 && base64Pattern.matches(value) && value.length % 4 == 0) {
      "Invalid attestation challenge"
    }
    val decoded = Base64.decode(value, Base64.NO_WRAP)
    require(decoded.size in 16..64 && encode(decoded) == value) { "Invalid attestation challenge" }
    return decoded
  }

  fun challengeBytes(value: String): ByteArray {
    require(value.isNotEmpty() && value.length <= 16384) { "Invalid signing challenge" }
    var i = 0
    while (i < value.length) {
      val c = value[i]
      if (c.isHighSurrogate()) {
        require(i + 1 < value.length && value[i + 1].isLowSurrogate()) { "Invalid UTF-8 challenge" }
        i += 2
      } else {
        require(!c.isLowSurrogate()) { "Invalid UTF-8 challenge" }
        i++
      }
    }
    return value.toByteArray(StandardCharsets.UTF_8).also {
      require(it.size <= 16384) { "Signing challenge too long" }
    }
  }

  fun enroll(alias: String, challenge: ByteArray): Map<String, Any> {
    val store = keyStore()
    check(!store.containsAlias(alias)) { "Approval key already exists" }

    try {
      try {
        generate(alias, challenge, strongBox = true)
      } catch (_: StrongBoxUnavailableException) {
        check(!keyStore().containsAlias(alias)) { "Approval key already exists" }
        generate(alias, challenge, strongBox = false)
      }
      val result = publicInfo(alias).toMutableMap()
      val certificates = keyStore().getCertificateChain(alias)
        ?: error("Key attestation is unavailable")
      check(certificates.size >= 2) { "Key attestation is unavailable" }
      result["attestationCertificateChainBase64"] = certificates.map { encode(it.encoded) }
      return result
    } catch (error: Exception) {
      // A failed enrollment must never leave a key that the server did not accept.
      if (keyStore().containsAlias(alias)) keyStore().deleteEntry(alias)
      throw error
    }
  }

  fun publicInfo(alias: String): Map<String, Any> {
    val store = keyStore()
    val privateKey = store.getKey(alias, null) as? java.security.PrivateKey
      ?: error("Approval key does not exist")
    val keyInfo = KeyFactory.getInstance("EC", PROVIDER)
      .getKeySpec(privateKey, KeyInfo::class.java) as KeyInfo
    val securityLevel = when (keyInfo.securityLevel) {
      KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
      KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "trusted_environment"
      else -> error("Approval key is not hardware backed")
    }
    val publicKey = store.getCertificate(alias)?.publicKey?.encoded
      ?: error("Approval public key is unavailable")
    check(keyInfo.isUserAuthenticationRequired &&
      keyInfo.userAuthenticationValidityDurationSeconds == -1 &&
      keyInfo.userAuthenticationType == KeyProperties.AUTH_BIOMETRIC_STRONG &&
      keyInfo.isUserAuthenticationRequirementEnforcedBySecureHardware &&
      keyInfo.isInvalidatedByBiometricEnrollment) {
      "Approval key has an invalid authentication policy"
    }
    return mapOf("publicKeySpkiBase64" to encode(publicKey), "securityLevel" to securityLevel)
  }

  fun signingSignature(alias: String): Signature {
    publicInfo(alias)
    val privateKey = keyStore().getKey(alias, null) as java.security.PrivateKey
    return Signature.getInstance("SHA256withECDSA").apply { initSign(privateKey) }
  }

  fun delete(alias: String) {
    val store = keyStore()
    if (store.containsAlias(alias)) store.deleteEntry(alias)
  }

  fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

  private fun requireSupported() {
    check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { "Android 11 or newer is required" }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

  private fun generate(alias: String, challenge: ByteArray, strongBox: Boolean) {
    val parameters = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setUserAuthenticationRequired(true)
      .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
      .setInvalidatedByBiometricEnrollment(true)
      .setAttestationChallenge(challenge)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setIsStrongBoxBacked(strongBox)
      }
      .build()
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER).apply {
      initialize(parameters)
      generateKeyPair()
    }
  }
}
