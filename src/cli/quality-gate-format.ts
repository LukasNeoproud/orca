import type {
  QualityGateDefinition,
  QualityGateFreshness,
  QualityGateListResult,
  QualityGateRunView,
  QualityGateStatusResult
} from '../shared/quality-gate-types'
import type { QualityGateCliRunResult } from './quality-gate-run-wait'

const OUTPUT_TAIL_LINES = 20

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

function duration(run: QualityGateRunView): string | null {
  if (run.startedAt === null || run.finishedAt === null) {
    return null
  }
  return `${((run.finishedAt - run.startedAt) / 1000).toFixed(1)}s`
}

function runLine(run: QualityGateRunView): string {
  return [
    run.status,
    run.gateId,
    run.gate.name,
    requirement(run.gate),
    run.exitCode === null ? null : `exit ${run.exitCode}`,
    duration(run),
    run.source?.head ? `commit ${run.source.head.slice(0, 10)}` : null,
    run.source?.clean === false ? 'uncommitted changes' : null,
    freshnessLabel(run.freshness)
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

export function formatQualityGateStatus(result: QualityGateStatusResult): string {
  if (result.gates.length === 0) {
    return 'No quality gates are set up for this repository.'
  }
  return result.gates
    .map(({ gate, latestRun }) =>
      latestRun
        ? [runLine(latestRun), ...(latestRun.error ? [`  ${latestRun.error}`] : [])].join('\n')
        : ['never run', gate.id, gate.name, requirement(gate)].join('\t')
    )
    .join('\n')
}

export function formatQualityGateRunResult(result: QualityGateCliRunResult): string {
  if (result.runs.length === 0) {
    return 'No quality gates are set up for this repository. Nothing ran.'
  }
  const blocks = result.runs.map(({ run, started, stdout, stderr }) =>
    [
      runLine(run),
      ...(started ? [] : ['  Already running when asked; this is the run that was in progress.']),
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
