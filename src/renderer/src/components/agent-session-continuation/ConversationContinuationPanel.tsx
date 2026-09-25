import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  SquareSplitVertical,
  SquareTerminal,
  X
} from 'lucide-react'
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
  terminalActions?: {
    onContinueInNewSession?: () => void
    onToggleNativeChat?: () => void
    isChatViewMode?: boolean
    onSplitPane?: () => void
    onClosePane?: () => void
    closeLabel?: string
  }
}

export function ConversationContinuationPanel({
  source,
  busy,
  compact,
  expanded: controlledExpanded,
  onExpandedChange,
  onContinue,
  terminalActions
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          type="button"
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
          <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          {translate('continuation.label', 'Conversation continuation')}
          {preparing ? <Loader2 className="size-3 animate-spin" /> : null}
        </Button>
        {terminalActions ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
            {terminalActions.onContinueInNewSession ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={terminalActions.onContinueInNewSession}
              >
                <MessageSquarePlus className="size-3" />
                {translate('continuation.newAgentSessionWithHandoff', 'New session with handoff…')}
              </Button>
            ) : null}
            {terminalActions.onToggleNativeChat ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={terminalActions.isChatViewMode ?? false}
                onClick={terminalActions.onToggleNativeChat}
              >
                {terminalActions.isChatViewMode ? (
                  <SquareTerminal className="size-3" />
                ) : (
                  <MessageSquare className="size-3" />
                )}
                {terminalActions.isChatViewMode
                  ? translate('components.native-chat.toggle.showTerminal', 'Show terminal')
                  : translate('components.native-chat.toggle.showChat', 'Show chat view')}
              </Button>
            ) : null}
            {terminalActions.onSplitPane ? (
              <Button type="button" variant="ghost" size="xs" onClick={terminalActions.onSplitPane}>
                <SquareSplitVertical className="size-3" />
                {translate(
                  'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
                  'Split Terminal Right'
                )}
              </Button>
            ) : null}
            {terminalActions.onClosePane ? (
              <Button type="button" variant="ghost" size="xs" onClick={terminalActions.onClosePane}>
                <X className="size-3" />
                {terminalActions.closeLabel ??
                  translate(
                    'auto.components.terminal.pane.TerminalContextMenu.8c17d6786d',
                    'Close Pane'
                  )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {view?.autoCompact ? (
              <Button
                size="xs"
                variant="secondary"
                disabled={busy || pending}
                onClick={() => void choose('original')}
              >
                {translate('continuation.original', 'Continue original')}
              </Button>
            ) : null}
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
