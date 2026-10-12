import { InvalidArgumentError } from '../../core'
import type { RuntimeTerminalSend } from '../../../../../shared/runtime-terminal-send-contract'
import { isTerminalQueryReply } from '../../../../../shared/terminal-query-reply'
import type { DriverState, OrcaRuntimeService } from '../../../orca-runtime'
import {
  TERMINAL_INPUT_MAX_BYTES,
  TERMINAL_INPUT_TOO_LARGE_ERROR,
  isTerminalInputTooLargeWithYield
} from '../../../../../shared/terminal-input'
import type { TerminalViewportClient } from './terminal-stream-types'

export function isTerminalInputLockedForClient(
  runtime: OrcaRuntimeService,
  ptyId: string,
  client: TerminalViewportClient | undefined
): boolean {
  if (client?.type === 'mobile') {
    return false
  }
  // Why: pre-refactor mobile builds sent no client metadata, so treat a missing client as legacy mobile (unlocked).
  if (!client) {
    return false
  }
  return runtime.getDriver(ptyId).kind === 'mobile'
}

export async function assertTerminalSendTextWithinLimit(text: string | undefined): Promise<void> {
  if (!text) {
    return
  }
  // Why: sends can be paste-sized; validate outside Zod so large input yields before runtime dispatch.
  if (await isTerminalInputTooLargeWithYield(text, TERMINAL_INPUT_MAX_BYTES)) {
    throw new InvalidArgumentError(TERMINAL_INPUT_TOO_LARGE_ERROR)
  }
}

export function resolveMobileFloorClientId(
  driver: DriverState | null,
  client: TerminalViewportClient | undefined
): string | null {
  if (client?.type === 'mobile') {
    return client.id
  }
  if (!client && driver?.kind === 'mobile') {
    return driver.clientId
  }
  return null
}

export type TerminalStreamInputOutcome = 'delivered' | 'rejected' | 'failed'

export function assertTerminalQueryReply(
  params: {
    inputKind?: string
    text?: string
    enter?: unknown
    interrupt?: unknown
    agentPrompt?: boolean
    requireAgentStatus?: string
    client?: TerminalViewportClient
  },
  clientId: string | undefined
): string | undefined {
  const queryReplyClientId = clientId ?? params.client?.id
  if (
    params.inputKind === 'query-reply' &&
    (!params.text ||
      !isTerminalQueryReply(params.text) ||
      params.enter === true ||
      params.interrupt === true ||
      params.agentPrompt === true ||
      params.requireAgentStatus !== undefined ||
      params.client?.type !== 'mobile' ||
      !queryReplyClientId ||
      (clientId !== undefined && params.client.id !== clientId))
  ) {
    throw new InvalidArgumentError('Invalid terminal query reply')
  }
  return queryReplyClientId
}

/** Binds the written PTY to the authenticated phone that drove it, for its approval gate. */
export function settleTerminalSendInput(
  runtime: OrcaRuntimeService,
  ptyId: string | null | undefined,
  result: { accepted: boolean },
  params: { inputKind?: string; client?: TerminalViewportClient },
  caller: { clientId?: string; clientKind?: string },
  floorClaim: MobileInputFloorClaimHolder
): void {
  if (!result.accepted) {
    floorClaim.current?.rollback()
    return
  }
  if (!ptyId || params.inputKind === 'query-reply') {
    return
  }
  const mobileClientId =
    caller.clientKind === 'mobile' &&
    caller.clientId &&
    params.client?.type === 'mobile' &&
    params.client.id === caller.clientId
      ? caller.clientId
      : null
  runtime.recordMobileApprovalInput?.(ptyId, mobileClientId)
}

function isTerminalStreamInputRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_not_writable') || message.includes('terminal_handle_stale')
}

export async function sendTerminalStreamInput(
  runtime: OrcaRuntimeService,
  args: {
    terminal: string
    text: string
    client: TerminalViewportClient | undefined
    isMobile: boolean
    /** Waits for the provider's handoff; one that may have written is `failed`, not `rejected`. */
    requireWriteSettlement?: boolean
    /** The connection's authenticated phone; only its own stream binds an approval. */
    authenticatedMobileClientId?: string
  }
): Promise<TerminalStreamInputOutcome> {
  const action = { text: args.text, enter: false, interrupt: false }
  const clientId = args.isMobile ? args.client?.id : undefined
  const floorClaim: MobileInputFloorClaimHolder = { current: null }
  const settlement = args.requireWriteSettlement ? { requireWriteSettlement: true as const } : {}
  const approvalClientId =
    args.isMobile &&
    args.authenticatedMobileClientId &&
    args.client?.id === args.authenticatedMobileClientId
      ? args.authenticatedMobileClientId
      : null
  let writtenPtyId: string | null = null
  try {
    const result = await runtime.sendTerminal(args.terminal, action, {
      inputKind: 'driving',
      ...settlement,
      ...(clientId
        ? {
            reserveWrite: (writePtyId: string) => {
              const claim = runtime.beginMobileInputFloor(writePtyId, clientId)
              if (!claim) {
                throw new Error('mobile_input_floor_unavailable')
              }
              floorClaim.current = claim
            },
            afterWrite: async (ptyId: string) => {
              writtenPtyId = ptyId
              await commitMobileInputFloorClaim(floorClaim)
            }
          }
        : {
            afterWrite: (ptyId: string) => {
              writtenPtyId = ptyId
            }
          })
    })
    const outcome = streamInputOutcome(result)
    if (outcome === 'rejected') {
      floorClaim.current?.rollback()
    } else if (outcome === 'delivered' && writtenPtyId) {
      runtime.recordMobileApprovalInput?.(writtenPtyId, approvalClientId)
    }
    return outcome
  } catch (error) {
    floorClaim.current?.rollback()
    return isTerminalStreamInputRejection(error) ? 'rejected' : 'failed'
  }
}

function streamInputOutcome(result: RuntimeTerminalSend): TerminalStreamInputOutcome {
  if (result.writeSettlement?.outcome === 'unverifiable') {
    // Why: only bytes that may already be in flight are ambiguous; the rest are a proven refusal.
    return result.writeSettlement.bytesHandedToTransport ? 'failed' : 'rejected'
  }
  return result.accepted ? 'delivered' : 'rejected'
}

export type MobileInputFloorClaimHolder = {
  current: ReturnType<OrcaRuntimeService['beginMobileInputFloor']>
}

export async function commitMobileInputFloorClaim(
  claim: MobileInputFloorClaimHolder
): Promise<void> {
  const current = claim.current
  if (!current) {
    return
  }
  try {
    await current.commit()
  } finally {
    // Why: the runtime may yield before the next write, which then needs a fresh reservation if desktop reclaimed the floor.
    if (claim.current === current) {
      claim.current = null
    }
  }
}

export function getTerminalSendGuardRefusedReason(
  error: unknown
): 'no-agent' | 'permission' | undefined {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('terminal_guard_permission')) {
    return 'permission'
  }
  if (message.includes('terminal_guard_no_agent')) {
    return 'no-agent'
  }
  return undefined
}

export function isTerminalSendGuardNotWritable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_guard_not_writable')
}

export function assertTerminalSendExactPtyBinding(
  runtime: OrcaRuntimeService,
  handle: string,
  expectedPtyId: string | undefined
): void {
  try {
    if (expectedPtyId && runtime.resolveLiveLeafForHandle(handle)?.ptyId === expectedPtyId) {
      return
    }
  } catch {
    // Fall through to the stable guarded-send result below.
  }
  throw new Error('terminal_guard_not_writable')
}
