import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  inspectContinuation,
  prepareContinuation,
  referenceContinuation,
  claimContinuationCandidate
} from '@/lib/conversation-continuation-client'
import type {
  ConversationContinuationMode,
  ConversationContinuationView
} from '../../../../shared/conversation-continuation-view'
import type { ConversationContinuationSource } from '../../../../shared/conversation-continuation'

export type ConversationContinuationPanelProps = {
  source: ConversationContinuationSource & { target: RuntimeClientTarget; sessionId?: string }
  busy: boolean
  compact?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onContinue: (
    mode: ConversationContinuationMode,
    candidate?: { providerSessionId: string; transcriptPath: string },
    reference?: string
  ) => void | Promise<void>
}

export function ConversationContinuationPanel({
  source,
  busy,
  compact,
  expanded: controlledExpanded,
  onExpandedChange,
  onContinue
}: ConversationContinuationPanelProps): React.JSX.Element {
  const delay = useAppStore((s) => s.settings?.conversationContinuationOfferAfterMs ?? 1_800_000)
  const [checkedAt, setCheckedAt] = useState(Date.now)
  const targetKind = source.target.kind
  const environmentId = source.target.kind === 'environment' ? source.target.environmentId : null
  const target = useMemo<RuntimeClientTarget>(
    () =>
      targetKind === 'environment'
        ? { kind: 'environment', environmentId: environmentId! }
        : { kind: 'local' },
    [targetKind, environmentId]
  )
  const requestSource = useMemo(
    () => ({ providerSessionId: source.providerSessionId, workspaceId: source.workspaceId }),
    [source.providerSessionId, source.workspaceId]
  )
  const [view, setView] = useState<ConversationContinuationView | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const isExpanded = controlledExpanded ?? expanded
  const setPanelExpanded = useCallback(
    (next: boolean) => {
      setExpanded(next)
      onExpandedChange?.(next)
    },
    [onExpandedChange]
  )
  const identity = JSON.stringify([source.providerSessionId, source.workspaceId, source.target])
  const mounted = useRef(false)
  const generation = useRef(0)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const currentIdentity = useRef(identity)
  currentIdentity.current = identity
  const refresh = useCallback(async () => {
    const requestGeneration = generation.current
    const result = await inspectContinuation(target, requestSource)
    if (
      mounted.current &&
      requestGeneration === generation.current &&
      currentIdentity.current === identity
    ) {
      setView(result)
      setReadError(null)
      setCheckedAt(Date.now())
    }
    return result
  }, [identity, target, requestSource])
  useEffect(() => {
    mounted.current = true
    setView(null)
    setError(null)
    setReadError(null)
    setExpanded(false)
    setPending(false)
    let stopped = false
    let polling = false
    const poll = async () => {
      if (polling || stopped) {
        return
      }
      polling = true
      try {
        await refresh()
      } catch (cause) {
        if (!stopped) {
          setReadError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        polling = false
      }
    }
    const timer = setInterval(() => void poll(), 15_000)
    void poll()
    return () => {
      stopped = true
      mounted.current = false
      generation.current += 1
      clearInterval(timer)
    }
  }, [refresh])
  const checkpoint = view?.checkpoint
  const offered =
    !busy &&
    delay > 0 &&
    checkpoint &&
    dismissed !== checkpoint.revision &&
    checkedAt - Date.parse(checkpoint.completedAt) >= delay
  const open = isExpanded || Boolean(offered)
  const preparing = view?.candidate?.status === 'preparing'

  async function choose(mode: ConversationContinuationMode): Promise<void> {
    if (busy || pending) {
      return
    }
    setPending(true)
    setPanelExpanded(true)
    setError(null)
    const assertCurrent = () => {
      if (!mounted.current || currentIdentity.current !== identity || busyRef.current) {
        throw new Error(
          translate(
            'continuation.changed',
            'The active conversation changed. Choose how to continue again.'
          )
        )
      }
    }
    try {
      if (mode === 'original') {
        setDismissed(checkpoint?.revision ?? null)
        setPanelExpanded(false)
        await onContinue(mode)
      } else if (mode === 'fresh') {
        await onContinue(mode)
      } else {
        const latest = await refresh()
        assertCurrent()
        if (!latest.checkpoint) {
          throw new Error(
            translate('continuation.noCheckpoint', 'Wait for the current turn to finish.')
          )
        }
        if (mode === 'reference') {
          const { reference } = await referenceContinuation(
            source.target,
            source,
            latest.checkpoint.revision
          )
          assertCurrent()
          await onContinue(mode, undefined, reference)
        } else {
          const candidate =
            latest.candidate?.status === 'ready'
              ? latest.candidate
              : await prepareContinuation(source.target, source, latest.checkpoint.revision)
          await refresh()
          assertCurrent()
          if (
            candidate.status === 'ready' &&
            candidate.providerSessionId &&
            candidate.transcriptPath
          ) {
            const claimed = await claimContinuationCandidate(source.target, candidate.candidateId)
            assertCurrent()
            setView((current) => (current ? { ...current, candidate: claimed } : current))
            await onContinue(mode, {
              providerSessionId: candidate.providerSessionId,
              transcriptPath: candidate.transcriptPath
            })
          } else if (candidate.status !== 'preparing') {
            throw new Error(
              candidate.error ??
                translate(
                  'continuation.unconfirmed',
                  'Preparation could not be confirmed. The original conversation is available.'
                )
            )
          }
        }
      }
    } catch (cause) {
      if (currentIdentity.current === identity) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (mounted.current && currentIdentity.current === identity) {
        setPending(false)
      }
    }
  }

  return (
    <section
      className="shrink-0 border-b border-border bg-background px-3 py-2"
      aria-label={translate('continuation.label', 'Conversation continuation')}
    >
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          if (open) {
            setDismissed(checkpoint?.revision ?? null)
            setPanelExpanded(false)
          } else {
            setPanelExpanded(true)
          }
        }}
        aria-expanded={open}
      >
        <ChevronDown className="size-3" />
        {translate('continuation.label', 'Conversation continuation')}
        {preparing ? <Loader2 className="size-3 animate-spin" /> : null}
      </Button>
      {open ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant="secondary"
              disabled={busy || pending}
              onClick={() => void choose('original')}
            >
              {translate('continuation.original', 'Continue original')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={
                busy || pending || preparing || !checkpoint || view?.candidate?.status === 'used'
              }
              onClick={() => void choose('compacted')}
            >
              {view?.candidate?.status === 'used'
                ? translate('continuation.selected', 'Copy selected')
                : preparing
                  ? translate('continuation.preparing', 'Preparing…')
                  : view?.candidate?.status === 'ready'
                    ? translate('continuation.compacted', 'Continue compacted')
                    : translate('continuation.prepare', 'Compact a copy')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy || pending || !checkpoint}
              onClick={() => void choose('reference')}
            >
              {translate('continuation.reference', 'New with reference')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy || pending}
              onClick={() => void choose('fresh')}
            >
              {translate('continuation.fresh', 'New conversation')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {busy
              ? translate('continuation.busy', 'Finish or stop the current turn before switching.')
              : compact
                ? translate(
                    'continuation.draft',
                    'Switching may discard the message being typed. The original conversation is preserved.'
                  )
                : translate(
                    'continuation.preserve',
                    'The original conversation is preserved. Preparing a copy uses model tokens.'
                  )}
          </p>
          {view?.candidate?.status === 'used' ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'continuation.recover',
                'This copy has already been selected. If switching was interrupted, reopen it from Session History.'
              )}
            </p>
          ) : null}
          {error || readError ? (
            <p role="alert" className="text-xs text-destructive">
              {error ?? readError}
            </p>
          ) : null}
          {view?.candidate?.error && !error ? (
            <p role="status" className="text-xs text-muted-foreground">
              {view.candidate.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
