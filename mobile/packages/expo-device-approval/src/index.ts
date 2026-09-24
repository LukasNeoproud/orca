import { requireOptionalNativeModule } from 'expo-modules-core'

/** Attestation is evidence for the server to validate, not a local trust verdict. */
export type DeviceApprovalEnrollment = {
  publicKeySpkiBase64: string
  attestationCertificateChainBase64: string[]
  securityLevel: 'strongbox' | 'trusted_environment'
}

export type DeviceApprovalPublicInfo = {
  publicKeySpkiBase64: string
  securityLevel: 'strongbox' | 'trusted_environment'
}

type NativeDeviceApproval = {
  enroll(hostId: string, attestationChallengeBase64: string): Promise<DeviceApprovalEnrollment>
  getPublicInfo(hostId: string): Promise<DeviceApprovalPublicInfo>
  sign(hostId: string, canonicalChallengeUtf8: string): Promise<{ signatureDerBase64: string }>
  deleteKey(hostId: string): Promise<void>
}

const nativeModule = requireOptionalNativeModule<NativeDeviceApproval>('ExpoDeviceApproval')

function requireModule(): NativeDeviceApproval {
  if (!nativeModule) {
    throw new Error('Device approval requires the Android native module (Android 11 or newer).')
  }
  return nativeModule
}

export const deviceApproval: NativeDeviceApproval = {
  async enroll(hostId, attestationChallengeBase64) {
    return requireModule().enroll(hostId, attestationChallengeBase64)
  },
  async getPublicInfo(hostId) {
    return requireModule().getPublicInfo(hostId)
  },
  async sign(hostId, canonicalChallengeUtf8) {
    return requireModule().sign(hostId, canonicalChallengeUtf8)
  },
  async deleteKey(hostId) {
    return requireModule().deleteKey(hostId)
  }
}
