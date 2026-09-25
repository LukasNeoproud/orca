export type DeviceApprovalEnrollmentStatus = {
  phase: 'idle' | 'waiting' | 'verifying' | 'ready' | 'confirming' | 'complete' | 'error'
  expiresAt?: number
  fingerprint?: string
  securityLevel?: 'tee' | 'strongbox'
  error?: string
}
