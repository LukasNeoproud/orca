import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { subscribeRuntimeRpc } from '@/runtime/runtime-rpc-subscribe'
import {
  QUALITY_GATES_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
  QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../shared/host-feature-runtime-capabilities'
import { readQualityGateChangeFrame } from '../../../shared/quality-gate-change-stream'
import type { QualityGateSetFeedbackLoopResult } from '../../../shared/quality-gate-feedback-loop'
import { hasRuntimeRpcErrorCode } from '../../../shared/runtime-rpc-error-code'
import type {
  QualityGateCancelResult,
  QualityGateRunOutput,
  QualityGateRunStartResult,
  QualityGateStatusResult
} from '../../../shared/quality-gate-types'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

const CALL_TIMEOUT_MS = 30_000
const CAPABILITY_TIMEOUT_MS = 15_000

// Codes a transport reports when the host did not answer; anything else is the host's own answer.
const CONTACT_LOST_CODES: ReadonlySet<string> = new Set([
  'remote_runtime_unavailable',
  'runtime_unavailable',
  'runtime_timeout',
  'runtime_manually_disconnected',
  'runtime_environment_changed'
])

export type QualityGateCallFailure = 'unsupported' | 'contact-lost' | 'refused'

/**
 * Why three kinds: a host from before gates and a host that cannot be reached must not read as a
 * failed gate, and only a refusal carries a message worth showing.
 */
export function classifyQualityGateCallFailure(error: unknown): QualityGateCallFailure {
  if (!(error instanceof RuntimeRpcCallError)) {
    return 'contact-lost'
  }
  if (error.code === 'method_not_found') {
    return 'unsupported'
  }
  return CONTACT_LOST_CODES.has(error.code) ? 'contact-lost' : 'refused'
}

/** Gates run on the host that owns the worktree: this app, or the Orca server it lives on. */
export async function qualityGatesSupported(target: RuntimeClientTarget): Promise<boolean> {
  if (target.kind === 'local') {
    return true
  }
  return runtimeEnvironmentSupportsCapability(
    target.environmentId,
    QUALITY_GATES_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
}

function call<TResult>(
  target: RuntimeClientTarget,
  method: string,
  worktreeId: string,
  params: Record<string, unknown> = {}
): Promise<TResult> {
  return callRuntimeRpc<TResult>(
    target,
    method,
    { worktree: `id:${worktreeId}`, ...params },
    { timeoutMs: CALL_TIMEOUT_MS }
  )
}

export function fetchQualityGateStatus(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<QualityGateStatusResult> {
  return call(target, 'qualityGates.status', worktreeId)
}

/** Starts the gates the host has for the repository; the request names gates, never commands. */
export function startQualityGates(
  target: RuntimeClientTarget,
  worktreeId: string,
  gateIds?: string[]
): Promise<QualityGateRunStartResult> {
  return call(target, 'qualityGates.run', worktreeId, gateIds ? { gateIds } : {})
}

export function fetchQualityGateOutput(
  target: RuntimeClientTarget,
  worktreeId: string,
  runId: string
): Promise<QualityGateRunOutput> {
  return call(target, 'qualityGates.output', worktreeId, { runId })
}

/** Stops every queued or running gate of the workspace, or only the named one. */
export function cancelQualityGates(
  target: RuntimeClientTarget,
  worktreeId: string,
  gateId?: string
): Promise<QualityGateCancelResult> {
  return call(target, 'qualityGates.cancel', worktreeId, gateId ? { gateId } : {})
}

/**
 * The workspace's own switch of the feedback loop. Only reached from a status that carries
 * `feedbackLoop`, which the host sends exactly when it has this method.
 */
export function setQualityGateFeedbackLoop(
  target: RuntimeClientTarget,
  worktreeId: string,
  enabled: boolean
): Promise<QualityGateSetFeedbackLoopResult> {
  return call(target, 'qualityGates.setFeedbackLoop', worktreeId, { enabled })
}

/** Whether the host signals changes itself; a host from before the stream is asked on an interval. */
export async function qualityGateChangesSupported(target: RuntimeClientTarget): Promise<boolean> {
  if (target.kind === 'local') {
    return true
  }
  return runtimeEnvironmentSupportsCapability(
    target.environmentId,
    QUALITY_GATES_SUBSCRIBE_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
}

/**
 * Whether the host can watch a workspace at the slow interval. One that cannot would read the tree
 * of every subscribed workspace every few seconds, so a background reader does not subscribe to it.
 */
export async function qualityGateBackgroundChangesSupported(
  target: RuntimeClientTarget
): Promise<boolean> {
  if (target.kind === 'local') {
    return true
  }
  return runtimeEnvironmentSupportsCapability(
    target.environmentId,
    QUALITY_GATES_SUBSCRIBE_CADENCE_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
}

export type QualityGateChangeHandlers = {
  /** The stream opened, or the host said the runs or the tree moved: read the status again. */
  onChanged: () => void
  /** The stream is over. `unsupported`: the host has no such stream and never will on this build. */
  onLost: (unsupported: boolean) => void
}

/**
 * `qualityGates.subscribe` for one workspace. The frames carry no state, so a frame this build
 * does not know is ignored and a lost stream costs nothing but the signal.
 */
export async function subscribeQualityGateChanges(
  target: RuntimeClientTarget,
  worktreeId: string,
  handlers: QualityGateChangeHandlers,
  options: { background?: boolean } = {}
): Promise<{ close: () => void }> {
  let subscriptionId: string | null = null
  let over = false
  const lose = (unsupported: boolean): void => {
    if (!over) {
      over = true
      handlers.onLost(unsupported)
    }
  }
  const handle = await subscribeRuntimeRpc(
    target,
    'qualityGates.subscribe',
    { worktree: `id:${worktreeId}`, ...(options.background ? { cadence: 'background' } : {}) },
    {
      onEvent: (result) => {
        const frame = readQualityGateChangeFrame(result)
        if (!frame || over) {
          return
        }
        if (frame.type === 'end') {
          lose(false)
          return
        }
        if (frame.type === 'ready') {
          subscriptionId = frame.subscriptionId
        }
        handlers.onChanged()
      },
      onError: (error) => lose(hasRuntimeRpcErrorCode(error, 'method_not_found')),
      onClose: () => lose(false)
    }
  )
  return {
    close: () => {
      over = true
      handle.unsubscribe()
      // A remote transport shares one connection, so the host is told which stream to end.
      if (target.kind === 'environment' && subscriptionId) {
        void callRuntimeRpc(target, 'qualityGates.unsubscribe', { subscriptionId }).catch(() => {})
      }
    }
  }
}
