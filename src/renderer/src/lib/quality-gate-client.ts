import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { QUALITY_GATES_RUNTIME_CAPABILITY } from '../../../shared/host-feature-runtime-capabilities'
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

export function cancelQualityGates(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<QualityGateCancelResult> {
  return call(target, 'qualityGates.cancel', worktreeId)
}
