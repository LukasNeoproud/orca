import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { fetchQualityGateOutput } from '@/lib/quality-gate-client'
import type {
  QualityGateRunOutput,
  QualityGateRunStatus,
  QualityGateRunView
} from '../../../../shared/quality-gate-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { LoadingSpinner } from '../LoadingSpinner'
import { Button } from '../ui/button'
import { qualityGateFreshnessLabel, qualityGateStatusLabel } from './quality-gate-labels'

const STATUS_TONE: Record<QualityGateRunStatus, string> = {
  queued: 'text-muted-foreground',
  running: 'text-muted-foreground',
  passed: 'text-status-success',
  failed: 'text-destructive',
  'timed-out': 'text-destructive',
  'not-started': 'text-destructive',
  cancelled: 'text-muted-foreground',
  unverifiable: 'text-status-warning'
}

type OutputState =
  | { runId: string; state: 'loading' }
  | { runId: string; state: 'loaded'; output: QualityGateRunOutput }
  | { runId: string; state: 'failed' }

function OutputStream({ label, text }: { label: string; text: string }): React.JSX.Element | null {
  if (!text) {
    return null
  }
  return (
    <div className="space-y-1">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <pre
        data-quality-gate-output={label}
        className="scrollbar-sleek max-h-64 overflow-auto rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap break-words select-text"
      >
        {text}
      </pre>
    </div>
  )
}

/** The latest run of one gate in the chosen workspace, with the end of its output on demand. */
export function QualityGateRunResult({
  run,
  target,
  worktreeId
}: {
  run: QualityGateRunView | null
  target: RuntimeClientTarget
  worktreeId: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [output, setOutput] = useState<OutputState | null>(null)
  const runId = run?.id ?? null
  const finished = run !== null && run.liveness === 'exited'
  const environmentId = target.kind === 'environment' ? target.environmentId : null

  useEffect(() => {
    if (!open || !finished || runId === null) {
      return
    }
    let cancelled = false
    setOutput({ runId, state: 'loading' })
    fetchQualityGateOutput(
      environmentId ? { kind: 'environment', environmentId } : { kind: 'local' },
      worktreeId,
      runId
    )
      .then((loaded) => {
        if (!cancelled) {
          setOutput({ runId, state: 'loaded', output: loaded })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOutput({ runId, state: 'failed' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, finished, runId, environmentId, worktreeId])

  if (!run) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate('qualityGates.neverRun', 'Not run in this workspace yet')}
      </p>
    )
  }

  const freshness = qualityGateFreshnessLabel(run.freshness)
  const shownOutput = output?.runId === run.id ? output : null
  const duration =
    run.startedAt !== null && run.finishedAt !== null
      ? `${((run.finishedAt - run.startedAt) / 1000).toFixed(1)} s`
      : null

  return (
    <div className="space-y-2" data-quality-gate-run-status={run.status}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={cn('inline-flex items-center gap-1.5 font-medium', STATUS_TONE[run.status])}
        >
          {run.liveness === 'live' ? <LoadingSpinner className="size-3" /> : null}
          {qualityGateStatusLabel(run.status)}
        </span>
        {run.exitCode !== null ? (
          <span className="text-muted-foreground">
            {translate('qualityGates.exitCode', 'exit code {{value0}}', { value0: run.exitCode })}
          </span>
        ) : null}
        {duration ? <span className="text-muted-foreground">{duration}</span> : null}
        {run.source?.head ? (
          <span className="font-mono text-muted-foreground">{run.source.head.slice(0, 10)}</span>
        ) : null}
        {run.source?.clean === false ? (
          <span className="text-muted-foreground">
            {translate('qualityGates.uncommittedChanges', 'with uncommitted changes')}
          </span>
        ) : null}
        {freshness ? (
          <span className={cn(freshness.stale ? 'text-status-warning' : 'text-muted-foreground')}>
            {freshness.text}
          </span>
        ) : null}
        {finished ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronDown /> : <ChevronRight />}
            {translate('qualityGates.output', 'Output')}
          </Button>
        ) : null}
      </div>
      {run.error ? <p className="text-xs text-muted-foreground select-text">{run.error}</p> : null}
      {open && finished && shownOutput ? (
        shownOutput.state === 'loading' ? null : shownOutput.state === 'failed' ? (
          <p role="alert" className="text-xs text-destructive">
            {translate('qualityGates.outputFailed', 'The output could not be read from the host.')}
          </p>
        ) : shownOutput.output.stdout || shownOutput.output.stderr ? (
          <div className="space-y-2">
            {shownOutput.output.run.outputTruncated ? (
              <p className="text-xs text-muted-foreground">
                {translate('qualityGates.outputTruncated', 'Only the end of the output is kept.')}
              </p>
            ) : null}
            <OutputStream label="stdout" text={shownOutput.output.stdout} />
            <OutputStream label="stderr" text={shownOutput.output.stderr} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('qualityGates.outputEmpty', 'The command printed nothing.')}
          </p>
        )
      ) : null}
    </div>
  )
}
