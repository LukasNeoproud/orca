import { z } from 'zod'
import { defineMethod, type RpcContext } from '../core'
import { deviceApprovalMailbox } from '../../../device-approval/device-approval-mailbox'
import {
  ApprovalResponseSchema,
  EnrollmentResponseSchema,
  parseDeviceApprovalPayload
} from '../../../../shared/device-approval-contract'

function requirePhone(ctx: RpcContext) {
  if (
    process.platform !== 'darwin' ||
    ctx.clientKind !== 'mobile' ||
    !ctx.pairedDeviceId ||
    !ctx.connectionId
  ) {
    throw new Error('Device approvals require a paired mobile connection to this Mac')
  }
}

export const DEVICE_APPROVAL_METHODS = [
  defineMethod({
    name: 'deviceApproval.list',
    params: z.object({}).strict(),
    handler: async (_, ctx) => {
      requirePhone(ctx)
      return deviceApprovalMailbox.list()
    }
  }),
  defineMethod({
    name: 'deviceApproval.respond',
    params: ApprovalResponseSchema,
    handler: async (response, ctx) => {
      requirePhone(ctx)
      const pending = parseDeviceApprovalPayload(
        await deviceApprovalMailbox.read(response.requestId)
      )
      if (!('operation' in pending)) {
        throw new Error('Expected signing request')
      }
      await deviceApprovalMailbox.respond(response)
      return { submitted: true }
    }
  }),
  defineMethod({
    name: 'deviceApproval.enroll',
    params: EnrollmentResponseSchema,
    handler: async (response, ctx) => {
      requirePhone(ctx)
      const pending = parseDeviceApprovalPayload(
        await deviceApprovalMailbox.read(response.requestId)
      )
      if (!('kind' in pending)) {
        throw new Error('Expected enrollment request')
      }
      // The local setup verifier validates attestation before Touch ID enrollment; RPC cannot enroll trust.
      await deviceApprovalMailbox.respond(response)
      return { submitted: true }
    }
  })
]
