import type { QualityGateSetFeedbackLoopResult } from '../../shared/quality-gate-feedback-loop'
import type {
  QualityGateCancelResult,
  QualityGateDefinition,
  QualityGateListResult,
  QualityGateRunStartResult,
  QualityGateStatusResult
} from '../../shared/quality-gate-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getRepeatedStringFlag } from '../flags'
import { printResult } from '../format'
import { formatQualityGateFeedbackLoop } from '../quality-gate-feedback-loop-format'
import {
  formatQualityGateCancelResult,
  formatQualityGateList,
  formatQualityGateRunResult,
  formatQualityGateRunStarted,
  formatQualityGateStatus
} from '../quality-gate-format'
import { waitForQualityGateRuns, type QualityGateRpcCall } from '../quality-gate-run-wait'
import { RuntimeClientError, type RuntimeRpcSuccess } from '../runtime-client'
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

/** Ids of the gates named on the command line, or undefined when none were named. */
async function requestedGateIds(
  context: HandlerContext,
  call: QualityGateRpcCall,
  worktree: string
): Promise<string[] | undefined> {
  const requested = getRepeatedStringFlag(context.flags, 'gate')
  if (requested.length === 0) {
    return undefined
  }
  const listed = await call<QualityGateListResult>('qualityGates.list', { worktree })
  return resolveGateIds(requested, listed.result.gates)
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
    const gateIds = await requestedGateIds(context, call, worktree)
    const started = await call<QualityGateRunStartResult>('qualityGates.run', {
      worktree,
      ...(gateIds ? { gateIds } : {})
    })
    if (context.flags.get('no-wait') === true) {
      printResult(started, context.json, formatQualityGateRunStarted)
      return
    }
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
  },
  'gates cancel': async (context) => {
    const call = gateCaller(context.client)
    const worktree = await worktreeSelector(context)
    const gateIds = await requestedGateIds(context, call, worktree)
    const format = (result: QualityGateCancelResult): string =>
      formatQualityGateCancelResult(result, gateIds)
    if (!gateIds) {
      printResult(
        await call<QualityGateCancelResult>('qualityGates.cancel', { worktree }),
        context.json,
        format
      )
      return
    }
    // The host stops one gate per call; asking for each keeps one result for the whole request.
    let response: RuntimeRpcSuccess<QualityGateCancelResult> | undefined
    const cancelled: QualityGateCancelResult['cancelled'] = []
    for (const gateId of gateIds) {
      response = await call<QualityGateCancelResult>('qualityGates.cancel', { worktree, gateId })
      cancelled.push(...response.result.cancelled)
    }
    if (response) {
      printResult({ ...response, result: { cancelled } }, context.json, format)
    }
  },
  'gates loop': async (context) => {
    const state = context.flags.get('state')
    if (state !== 'on' && state !== 'off') {
      throw new RuntimeClientError('invalid_argument', 'Use orca gates loop off (or on).')
    }
    const call = gateCaller(context.client)
    const response = await call<QualityGateSetFeedbackLoopResult>('qualityGates.setFeedbackLoop', {
      worktree: await worktreeSelector(context),
      enabled: state === 'on'
    })
    printResult(
      response,
      context.json,
      (result) => formatQualityGateFeedbackLoop(result.feedbackLoop) ?? 'Feedback loop updated.'
    )
  }
}
