import { z } from 'zod'

export const ApprovalRequestId = z.string().regex(/^[a-f0-9]{32}$/)
export const ApprovalKeyId = z.string().regex(/^[a-f0-9]{64}$/)
const Time = z.number().int().positive().safe()
const Base64 = z
  .string()
  .min(4)
  .max(32_768)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
const Group = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/)
export const PrivateDistributionOperation = z
  .object({
    kind: z.literal('private-android-distribution'),
    mode: z.enum(['build', 'publish']),
    commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
    firebaseAppId: z.literal('1:100414786379:android:410ca57940be633c0676ce'),
    packageName: z.literal('cz.neoproud.orca.dev'),
    groups: z.array(Group).max(20),
    releaseNotesSha256: ApprovalKeyId
  })
  .strict()
  .refine((value) => value.mode !== 'publish' || value.groups.length > 0)
  .refine((value) =>
    value.groups.every((group, index) => index === 0 || value.groups[index - 1]! < group)
  )
  .refine(
    (value) =>
      value.mode !== 'build' ||
      (value.groups.length === 0 &&
        value.releaseNotesSha256 ===
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  )

export const KeychainReadOperation = z.object({ kind: z.literal('keychain-read') }).strict()
const KeychainName = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      new TextEncoder().encode(value).byteLength <= 256 &&
      !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
  )
const KeychainRequest = z.object({ service: KeychainName, account: KeychainName }).strict()
const CredentialRequest = z.object({ service: z.string(), account: z.string() }).strict()

export const ApprovalChallengeSchema = z
  .object({
    version: z.literal(1),
    requestId: ApprovalRequestId,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    keyId: ApprovalKeyId,
    requesterPid: z.number().int().positive().safe(),
    createdAt: Time,
    expiresAt: Time,
    operation: z.union([PrivateDistributionOperation, KeychainReadOperation]),
    requests: z.array(CredentialRequest).min(1).max(32)
  })
  .strict()
  .superRefine((value, context) => {
    const accounts = [
      'android-keystore-base64',
      'android-keystore-password',
      'android-key-alias',
      'android-key-password',
      'firebase-service-account-json'
    ]
    if (value.operation.kind === 'private-android-distribution') {
      if (
        value.requests.length !== accounts.length ||
        value.requests.some(
          (row, i) =>
            row.service !== 'cz.neoproud.orca.dev.private-distribution' ||
            row.account !== accounts[i]
        )
      ) {
        context.addIssue({ code: 'custom', message: 'Unexpected credential scope' })
      }
    } else {
      const pairs = new Set<string>()
      for (const request of value.requests) {
        if (!KeychainRequest.safeParse(request).success) {
          context.addIssue({ code: 'custom', message: 'Invalid Keychain credential scope' })
          break
        }
        const pair = JSON.stringify([request.service, request.account])
        if (pairs.has(pair)) {
          context.addIssue({ code: 'custom', message: 'Duplicate Keychain credential scope' })
          break
        }
        pairs.add(pair)
      }
    }
    if (value.expiresAt <= value.createdAt || value.expiresAt - value.createdAt > 120_000) {
      context.addIssue({ code: 'custom', message: 'Invalid approval lifetime' })
    }
  })
export const EnrollmentRequestSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal('enrollment'),
    requestId: ApprovalRequestId,
    challengeBase64: z
      .string()
      .length(44)
      .regex(/^[A-Za-z0-9+/]{43}=$/),
    createdAt: Time,
    expiresAt: Time
  })
  .strict()
  .refine(
    (value) => value.expiresAt > value.createdAt && value.expiresAt - value.createdAt <= 300_000
  )
export const ApprovalResponseSchema = z
  .object({
    version: z.literal(1),
    requestId: ApprovalRequestId,
    signatureDerBase64: z
      .string()
      .min(88)
      .max(104)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  })
  .strict()
export const EnrollmentResponseSchema = z
  .object({
    version: z.literal(1),
    requestId: ApprovalRequestId,
    publicKeySpkiBase64: z
      .string()
      .min(100)
      .max(200)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    attestationCertificateChainBase64: z.array(Base64).min(2).max(8)
  })
  .strict()
export type ApprovalChallenge = z.infer<typeof ApprovalChallengeSchema>
export type EnrollmentRequest = z.infer<typeof EnrollmentRequestSchema>
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>
export type EnrollmentResponse = z.infer<typeof EnrollmentResponseSchema>

export function parseDeviceApprovalPayload(payload: string, now = Date.now()) {
  if (new TextEncoder().encode(payload).byteLength > 16_384) {
    throw new Error('Approval request is too large')
  }
  const raw: unknown = JSON.parse(payload)
  const request = EnrollmentRequestSchema.safeParse(raw)
  const value = request.success ? request.data : ApprovalChallengeSchema.parse(raw)
  if (value.createdAt > now + 5_000 || value.expiresAt <= now) {
    throw new Error('Approval request has expired or has an invalid timestamp')
  }
  return value
}

export const DeviceApprovalListParams = z.object({}).strict()
