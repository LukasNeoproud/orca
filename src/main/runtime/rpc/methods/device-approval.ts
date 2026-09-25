import { z } from 'zod'
import { defineMethod, type RpcContext } from '../core'
import { deviceApprovalMailbox } from '../../../device-approval/device-approval-mailbox'
import { isRequesterDescendantOfMobileTerminal } from '../../../device-approval/device-approval-request-origin'
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

async function assertMobileTerminalRequest(ctx: RpcContext, requesterPid: number): Promise<void> {
  const roots = await ctx.runtime.getMobileApprovalTerminalRootPids(ctx.clientId ?? '')
  if (!(await isRequesterDescendantOfMobileTerminal(requesterPid, roots))) {
    throw new Error('Approval request did not originate in a terminal controlled by this phone')
  }
}

export const DEVICE_APPROVAL_METHODS = [
  defineMethod({
    name: 'deviceApproval.list',
    params: z.object({}).strict(),
    handler: async (_, ctx) => {
      requirePhone(ctx)
      const listing = await deviceApprovalMailbox.list()
      const roots = await ctx.runtime.getMobileApprovalTerminalRootPids(ctx.clientId ?? '')
      const pending = await Promise.all(
        listing.pending.map(async (item) => {
          const request = parseDeviceApprovalPayload(item.payload)
          if (!('operation' in request)) {
            return item
          }
          return (await isRequesterDescendantOfMobileTerminal(request.requesterPid, roots))
            ? item
            : null
        })
      )
      return { ...listing, pending: pending.filter((item) => item !== null) }
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
      await assertMobileTerminalRequest(ctx, pending.requesterPid)
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
