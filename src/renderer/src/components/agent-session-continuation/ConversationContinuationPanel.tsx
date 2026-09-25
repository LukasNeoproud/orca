import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  SquareSplitVertical,
  SquareTerminal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  inspectContinuation,
  prepareContinuation,
  referenceContinuation,
  referenceContinuationCandidate,
  assertContinuationCandidateReferenceSupported,
  claimContinuationCandidate
} from '@/lib/conversation-continuation-client'
import type {
  ConversationContinuationMode,
  ConversationContinuationView
} from '../../../../shared/conversation-continuation-view'
import type { ConversationContinuationSource } from '../../../../shared/conversation-continuation'
import { ConversationContinuationChoices } from './ConversationContinuationChoices'
import { useContinuationTargetAgent } from './use-continuation-target-agent'
import { waitForContinuationSelection } from './prepare-continuation-selection'

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
    onToggleNativeChat?: () => void
    isChatViewMode?: boolean
    onSplitPane?: () => void
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
  const actionGeneration = useRef(0)
  const setPanelExpanded = useCallback(
    (next: boolean) => {
      if (!next) {
        actionGeneration.current += 1
      }
      setExpanded(next)
      onExpandedChange?.(next)
    },
    [onExpandedChange]
  )
  const identity = JSON.stringify([source.providerSessionId, source.workspaceId, source.target])
  const targetAgents = useContinuationTargetAgent({
    workspaceId: source.workspaceId,
    enabled: isExpanded,
    identity
  })
  const mounted = useRef(false)
  const generation = useRef(0)
  const busyRef = useRef(busy)
  if (busy && !busyRef.current) {
    actionGeneration.current += 1
  }
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
  const open = isExpanded
  const preparing = view?.candidate?.status === 'preparing'

  async function choose(mode: ConversationContinuationMode): Promise<void> {
    if (busy || pending || mode === 'original') {
      return
    }
    setPending(true)
    setPanelExpanded(true)
    setError(null)
    const action = actionGeneration.current
    const agent = targetAgents.selectedAgent
    const otherAgent = agent !== 'codex'
    const assertCurrent = () => {
      if (
        !mounted.current ||
        currentIdentity.current !== identity ||
        busyRef.current ||
        action !== actionGeneration.current
      ) {
        throw new Error(
          translate(
            'continuation.changed',
            'The active conversation changed. Choose how to continue again.'
          )
        )
      }
    }
    try {
      if (mode === 'fresh') {
        await (otherAgent ? targetAgents.launch(agent, undefined, assertCurrent) : onContinue(mode))
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
          await (otherAgent
            ? targetAgents.launch(agent, reference, assertCurrent)
            : onContinue(mode, undefined, reference))
        } else {
          if (otherAgent) {
            await assertContinuationCandidateReferenceSupported(source.target)
            assertCurrent()
          }
          const initialCandidate =
            latest.candidate?.status === 'ready' || latest.candidate?.status === 'preparing'
              ? latest.candidate
              : await prepareContinuation(source.target, source, latest.checkpoint.revision)
          const candidate = await waitForContinuationSelection({
            candidate: initialCandidate,
            revision: latest.checkpoint.revision,
            refresh,
            assertCurrent
          })
          if (
            candidate.status === 'ready' &&
            candidate.providerSessionId &&
            candidate.transcriptPath
          ) {
            if (otherAgent) {
              const { reference } = await referenceContinuationCandidate(
                source.target,
                source,
                latest.checkpoint.revision,
                candidate.candidateId
              )
              assertCurrent()
              await targetAgents.launch(agent, reference, assertCurrent)
            } else {
              const claimed = await claimContinuationCandidate(source.target, candidate.candidateId)
              assertCurrent()
              setView((current) => (current ? { ...current, candidate: claimed } : current))
              await onContinue(mode, {
                providerSessionId: candidate.providerSessionId,
                transcriptPath: candidate.transcriptPath
              })
            }
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
      setPanelExpanded(false)
    } catch (cause) {
      if (
        mounted.current &&
        currentIdentity.current === identity &&
        action === actionGeneration.current
      ) {
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
      className="@container/continuation shrink-0 border-b border-border bg-background px-3 py-1.5"
      aria-label={translate('continuation.label', 'Conversation continuation')}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (!next && offered) {
              setDismissed(checkpoint?.revision ?? null)
            }
            setPanelExpanded(next)
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={offered ? 'secondary' : 'ghost'}
              size="xs"
              aria-expanded={open}
            >
              {translate('continuation.open', 'Continue…')}
              {preparing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ChevronDown className="size-3" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="p-0">
            <ConversationContinuationChoices
              view={view}
              busy={busy}
              pending={pending}
              compact={compact}
              error={error}
              readError={readError ?? targetAgents.error}
              onChoose={(mode) => void choose(mode)}
              targetAgent={targetAgents.selectedAgent}
              agents={targetAgents.agents}
              detecting={targetAgents.detecting}
              onAgentChange={targetAgents.setSelectedAgent}
            />
          </PopoverContent>
        </Popover>
        {terminalActions ? (
          <div className="ml-auto flex min-w-0 items-center justify-end gap-1">
            {terminalActions.onToggleNativeChat ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={`${translate('continuation.view', 'View')}: ${terminalActions.isChatViewMode ? translate('continuation.chat', 'Chat') : translate('continuation.terminal', 'Terminal')}`}
                  >
                    {terminalActions.isChatViewMode ? (
                      <MessageSquare className="size-3" />
                    ) : (
                      <SquareTerminal className="size-3" />
                    )}
                    <span className="@max-[340px]/continuation:hidden">
                      {translate('continuation.view', 'View')}:{' '}
                      {terminalActions.isChatViewMode
                        ? translate('continuation.chat', 'Chat')
                        : translate('continuation.terminal', 'Terminal')}
                    </span>
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={terminalActions.isChatViewMode ? 'chat' : 'terminal'}
                    onValueChange={(value) => {
                      if ((value === 'chat') !== Boolean(terminalActions.isChatViewMode)) {
                        terminalActions.onToggleNativeChat?.()
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="terminal">
                      <SquareTerminal className="size-3" />
                      {translate('continuation.terminal', 'Terminal')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="chat">
                      <MessageSquare className="size-3" />
                      {translate('continuation.chat', 'Chat')}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {terminalActions.onSplitPane ? (
              <Button type="button" variant="ghost" size="xs" onClick={terminalActions.onSplitPane}>
                <SquareSplitVertical className="size-3" />
                <span className="@max-[340px]/continuation:sr-only">
                  {translate(
                    'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
                    'Split Terminal Right'
                  )}
                </span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
