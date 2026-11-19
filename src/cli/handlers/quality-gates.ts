import type {
  QualityGateDefinition,
  QualityGateListResult,
  QualityGateRunStartResult,
  QualityGateStatusResult
} from '../../shared/quality-gate-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRepeatedStringFlag } from '../flags'
import { printResult } from '../format'
import {
  formatQualityGateList,
  formatQualityGateRunResult,
  formatQualityGateStatus
} from '../quality-gate-format'
import { waitForQualityGateRuns, type QualityGateRpcCall } from '../quality-gate-run-wait'
import { RuntimeClientError } from '../runtime-client'
import { getOptionalWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

// Why: a host from before the gate methods answers method_not_found, which reads as an Orca bug
// rather than as a host that needs updating.
function gateCaller(client: HandlerContext['client']): QualityGateRpcCall {
  return async (method, params) => {
    try {
      return await client.call(method, params)
    } catch (error) {
      if (error instanceof RuntimeClientError && error.code === 'method_not_found') {
        throw new RuntimeClientError(
          'incompatible_runtime',
          'This Orca host does not support quality gates yet. Update Orca on the execution host.'
        )
      }
      throw error
    }
  }
}

async function worktreeSelector({ flags, cwd, client }: HandlerContext): Promise<string> {
  return (
    (await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)) ??
    (await resolveCurrentWorktreeSelector(cwd, client))
  )
}

/** A gate is named by its id, or by its name when exactly one gate carries it. */
function resolveGateIds(requested: string[], gates: QualityGateDefinition[]): string[] {
  const ids = requested.map((token) => {
    const byId = gates.find((gate) => gate.id === token)
    const byName = gates.filter((gate) => gate.name.toLowerCase() === token.toLowerCase())
    const match = byId ?? (byName.length === 1 ? byName[0] : undefined)
    if (!match) {
      throw new RuntimeClientError(
        'invalid_argument',
        byName.length > 1
          ? `More than one quality gate is named "${token}". Use its id from orca gates list.`
          : `No quality gate "${token}" is set up for this repository. Available: ${gates.map((gate) => gate.id).join(', ') || 'none'}.`
      )
    }
    return match.id
  })
  return [...new Set(ids)]
}

export const QUALITY_GATE_HANDLERS: Record<string, CommandHandler> = {
  'gates list': async (context) => {
    const response = await gateCaller(context.client)<QualityGateListResult>('qualityGates.list', {
      worktree: await worktreeSelector(context)
    })
    printResult(response, context.json, formatQualityGateList)
  },
  'gates status': async (context) => {
    const response = await gateCaller(context.client)<QualityGateStatusResult>(
      'qualityGates.status',
      { worktree: await worktreeSelector(context) }
    )
    printResult(response, context.json, formatQualityGateStatus)
  },
  'gates run': async (context) => {
    const call = gateCaller(context.client)
    const worktree = await worktreeSelector(context)
    const requested = getRepeatedStringFlag(context.flags, 'gate')
    const gateIds =
      requested.length > 0
        ? resolveGateIds(
            requested,
            (await call<QualityGateListResult>('qualityGates.list', { worktree })).result.gates
          )
        : undefined
    const started = await call<QualityGateRunStartResult>('qualityGates.run', {
      worktree,
      ...(gateIds ? { gateIds } : {})
    })
    const result = await waitForQualityGateRuns({
      call,
      worktree,
      started: started.result,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    })
    printResult({ ...started, result }, context.json, formatQualityGateRunResult)
    if (result.outcome !== 'passed') {
      process.exitCode = 1
    }
  }
}
