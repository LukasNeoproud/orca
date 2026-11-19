import { formatQualityGateFeedbackLoop } from './quality-gate-feedback-loop-format'
import type {
  QualityGateCancelResult,
  QualityGateDefinition,
  QualityGateFreshness,
  QualityGateListResult,
  QualityGateRunStartResult,
  QualityGateRunView,
  QualityGateStatusResult
} from '../shared/quality-gate-types'
import type { QualityGateCliRunResult } from './quality-gate-run-wait'

const OUTPUT_TAIL_LINES = 20
const ALREADY_RUNNING = '  Already running when asked; this is the run that was in progress.'

const STALE_REASONS: Record<string, string> = {
  'head-changed': 'another commit',
  'tree-changed': 'files changed',
  'gate-changed': 'gate edited'
}

function requirement(gate: Pick<QualityGateDefinition, 'required'>): string {
  return gate.required ? 'required' : 'optional'
}

function freshnessLabel(freshness: QualityGateFreshness | null): string | null {
  if (!freshness) {
    return null
  }
  switch (freshness.state) {
    case 'current':
      return 'current'
    case 'stale':
      return `stale (${freshness.reasons.map((reason) => STALE_REASONS[reason] ?? reason).join(', ')})`
    case 'unlinked':
      return 'not tied to a commit'
    case 'unknown':
      return 'freshness unknown'
  }
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
}

function duration(run: QualityGateRunView, now: number): string | null {
  if (run.startedAt === null) {
    return null
  }
  if (run.finishedAt !== null) {
    return seconds(run.finishedAt - run.startedAt)
  }
  return run.liveness === 'live' ? `${seconds(now - run.startedAt)} so far` : null
}

function runLine(run: QualityGateRunView, now = Date.now()): string {
  return [
    run.status,
    run.gateId,
    run.gate.name,
    requirement(run.gate),
    run.exitCode === null ? null : `exit ${run.exitCode}`,
    duration(run, now),
    run.source?.head ? `commit ${run.source.head.slice(0, 10)}` : null,
    run.source?.clean === false ? 'uncommitted changes' : null,
    freshnessLabel(run.freshness),
    // The id ties a line to the one `orca gates run --no-wait` printed.
    `run ${run.id}`
  ]
    .filter((part) => part !== null)
    .join('\t')
}

function tail(label: string, text: string): string[] {
  const lines = text.replace(/\n$/, '').split('\n')
  if (lines.length === 1 && lines[0] === '') {
    return []
  }
  const shown = lines.slice(-OUTPUT_TAIL_LINES)
  const omitted = lines.length - shown.length
  return [
    `  ${label}${omitted > 0 ? ` (last ${shown.length} lines)` : ''}:`,
    ...shown.map((line) => `    ${line}`)
  ]
}

export function formatQualityGateList(result: QualityGateListResult): string {
  if (result.gates.length === 0) {
    return 'No quality gates are set up for this repository. Add them in the repository settings of the Orca app.'
  }
  return result.gates
    .map((gate) =>
      [gate.id, gate.name, requirement(gate), `limit ${gate.timeoutSeconds}s`, gate.command].join(
        '\t'
      )
    )
    .join('\n')
}

export function formatQualityGateStatus(result: QualityGateStatusResult, now = Date.now()): string {
  if (result.gates.length === 0) {
    return 'No quality gates are set up for this repository.'
  }
  const loop = formatQualityGateFeedbackLoop(result.feedbackLoop)
  return [
    ...result.gates.map(({ gate, latestRun }) =>
      latestRun
        ? [runLine(latestRun, now), ...(latestRun.error ? [`  ${latestRun.error}`] : [])].join('\n')
        : ['never run', gate.id, gate.name, requirement(gate)].join('\t')
    ),
    ...(loop ? [loop] : [])
  ].join('\n')
}

export function formatQualityGateRunResult(result: QualityGateCliRunResult): string {
  if (result.runs.length === 0) {
    return 'No quality gates are set up for this repository. Nothing ran.'
  }
  const blocks = result.runs.map(({ run, started, stdout, stderr }) =>
    [
      runLine(run),
      ...(started ? [] : [ALREADY_RUNNING]),
      ...(run.error ? [`  ${run.error}`] : []),
      ...tail('stdout', stdout),
      ...tail('stderr', stderr)
    ].join('\n')
  )
  const summary: Record<QualityGateCliRunResult['outcome'], string> = {
    passed: 'Every required gate passed.',
    failed: 'A required gate did not pass.',
    unverifiable:
      'The outcome of a required gate could not be observed. Check orca gates status before relying on it.'
  }
  return [...blocks, summary[result.outcome]].join('\n')
}

export function formatQualityGateRunStarted(result: QualityGateRunStartResult): string {
  if (result.runs.length === 0) {
    return 'No quality gates are set up for this repository. Nothing ran.'
  }
  return [
    ...result.runs.flatMap(({ run, started }) => [
      runLine(run),
      ...(started ? [] : [ALREADY_RUNNING])
    ]),
    'Not waiting for the result. Follow the runs with orca gates status; stop them with orca gates cancel.'
  ].join('\n')
}

/** `gateIds` are the gates the user named; undefined means every gate of the workspace. */
export function formatQualityGateCancelResult(
  result: QualityGateCancelResult,
  gateIds: string[] | undefined
): string {
  if (result.cancelled.length === 0) {
    return gateIds
      ? `Not running in this workspace: ${gateIds.join(', ')}. Nothing was stopped.`
      : 'No quality gate is running in this workspace. Nothing was stopped.'
  }
  const unconfirmed = result.cancelled.filter((run) => run.liveness === 'live').length
  return [
    'Stopped:',
    ...result.cancelled.map((run) => runLine(run)),
    ...(unconfirmed > 0
      ? [
          'The host has not confirmed that every stopped command ended yet. Check orca gates status.'
        ]
      : [])
  ].join('\n')
}
