import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Link, Minimize2, RotateCcw } from 'lucide-react-native'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { ConversationContinuationView } from '../../../src/shared/conversation-continuation-view'
import { ActionSheetModal, type ActionSheetAction } from '../components/ActionSheetModal'
import type { RpcClient } from '../transport/rpc-client'
import type { Worktree } from '../worktree/workspace-list-types'
import type { MobileAiVaultResumeMutationRegistry } from '../session/ai-vault-resume-launch'
import { resolveMobileAiVaultSessionResumeTarget } from './agent-history-resume-target'
import {
  inspectMobileConversationContinuation,
  isSupportedMobileContinuationTarget,
  launchMobileConversationContinuation,
  mobileContinuationSource,
  MobileContinuationCancelledError
} from './mobile-agent-history-continuation'
import {
  loadMobileResumeMetadata,
  openMobileAgentHistorySession
} from './open-mobile-agent-history-session'

type ReadyContinuation = {
  source: ReturnType<typeof mobileContinuationSource>
  view: ConversationContinuationView
  worktreeId: string
}

type Props = {
  session: AiVaultSession | null
  client: RpcClient | null
  hostId: string
  hostCapabilities: readonly string[]
  hostPlatform: NodeJS.Platform | null
  hostTerminalWindowsShell: string | null
  activeWorktreeId: string
  worktrees: readonly Worktree[]
  terminalMutationRegistry: MobileAiVaultResumeMutationRegistry
  onClose: () => void
  onOpened: (worktreeId: string, message: string) => void
  onUnavailable: (session: AiVaultSession) => void
}

export function MobileAgentHistoryContinuationSheet(props: Props): React.JSX.Element {
  const [ready, setReady] = useState<ReadyContinuation | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingMode, setPendingMode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    setReady(null)
    setMessage(null)
    setPendingMode(null)
    const { client, session } = props
    if (!client || !session) {
      setLoading(false)
      return
    }
    setLoading(true)
    void loadContinuation(client, session, props)
      .then((result) => {
        if (generationRef.current !== generation) {
          return
        }
        if (!result) {
          props.onClose()
          props.onUnavailable(session)
          return
        }
        setReady(result)
      })
      .catch((error) => {
        if (generationRef.current === generation) {
          setMessage(error instanceof Error ? error.message : 'Unable to inspect continuation.')
        }
      })
      .finally(() => {
        if (generationRef.current === generation) {
          setLoading(false)
        }
      })
    return () => {
      generationRef.current += 1
    }
  }, [props.client, props.session])

  useEffect(() => {
    if (ready?.view.candidate?.status !== 'preparing' || !props.client) {
      return
    }
    const timer = setInterval(() => {
      void inspectMobileConversationContinuation(props.client!, ready.source)
        .then((view) => setReady((current) => (current ? { ...current, view } : current)))
        .catch(() => undefined)
    }, 2_000)
    return () => clearInterval(timer)
  }, [props.client, ready?.source, ready?.view.candidate?.status])

  const close = useCallback(() => {
    generationRef.current += 1
    props.onClose()
  }, [props])

  const choose = useCallback(
    async (mode: 'original' | 'compacted' | 'reference' | 'fresh'): Promise<void> => {
      const { client, session } = props
      if (!client || !session || !ready || pendingMode) {
        return
      }
      const generation = generationRef.current
      const isCurrent = () => generationRef.current === generation
      setPendingMode(mode)
      setMessage(null)
      try {
        if (mode === 'original') {
          const outcome = await openMobileAgentHistorySession({
            client,
            session,
            hostCapabilities: props.hostCapabilities,
            hostPlatform: props.hostPlatform,
            hostTerminalWindowsShell: props.hostTerminalWindowsShell,
            activeWorktreeId: props.activeWorktreeId,
            worktrees: props.worktrees,
            terminalMutationRegistry: props.terminalMutationRegistry
          })
          if (!isCurrent()) {
            return
          }
          if (outcome.kind === 'blocked') {
            setMessage(outcome.message)
            return
          }
          close()
          props.onOpened(outcome.worktreeId, outcome.message)
          return
        }

        const outcome = await launchMobileConversationContinuation({
          client,
          hostId: props.hostId,
          worktreeId: ready.worktreeId,
          source: ready.source,
          mode,
          isCurrent
        })
        if (!isCurrent()) {
          return
        }
        if (outcome.kind === 'preparing') {
          setReady((current) =>
            current
              ? { ...current, view: { ...current.view, candidate: outcome.candidate } }
              : current
          )
          setMessage('Preparing a compact copy…')
          return
        }
        if (outcome.kind === 'blocked') {
          setMessage(outcome.message)
          return
        }
        close()
        props.onOpened(ready.worktreeId, 'Chat opened.')
      } catch (error) {
        if (isCurrent() && !(error instanceof MobileContinuationCancelledError)) {
          setMessage(error instanceof Error ? error.message : 'Conversation continuation failed.')
        }
      } finally {
        if (isCurrent()) {
          setPendingMode(null)
        }
      }
    },
    [close, pendingMode, props, ready]
  )

  const actions = useMemo<ActionSheetAction[]>(() => {
    const checkpoint = ready?.view.checkpoint
    const candidate = ready?.view.candidate
    const preparing = candidate?.status === 'preparing'
    const busy = loading || pendingMode !== null
    return [
      {
        label: 'Continue Original',
        hint: 'Open the existing conversation with its full context.',
        icon: RotateCcw,
        disabled: !ready || busy,
        loading: pendingMode === 'original',
        skipAutoClose: true,
        onPress: () => void choose('original')
      },
      {
        label: candidate?.status === 'ready' ? 'Continue Compacted' : 'Compact a Copy',
        hint: 'Continue from a prepared compact context. The original stays in history.',
        icon: Minimize2,
        disabled: !ready || busy || !checkpoint || preparing || candidate?.status === 'used',
        loading: pendingMode === 'compacted' || preparing,
        skipAutoClose: true,
        onPress: () => void choose('compacted')
      },
      {
        label: 'New with Reference',
        hint: 'Start clean with a reference to the original conversation.',
        icon: Link,
        disabled: !ready || busy || !checkpoint,
        loading: pendingMode === 'reference',
        skipAutoClose: true,
        onPress: () => void choose('reference')
      },
      {
        label: 'New Conversation',
        hint: 'Start without prior context. The original stays in history.',
        icon: FileText,
        disabled: !ready || busy,
        loading: pendingMode === 'fresh',
        skipAutoClose: true,
        onPress: () => void choose('fresh')
      }
    ]
  }, [choose, loading, pendingMode, ready])

  return (
    <ActionSheetModal
      visible={props.session !== null}
      title="Continue Codex Conversation"
      message={
        message ??
        (loading
          ? 'Checking available continuation options…'
          : ready?.view.candidate?.status === 'used'
            ? 'This compact copy was already selected. Reopen it from Session History if switching was interrupted.'
            : ready?.view.checkpoint
              ? 'Choose how much context the next conversation should keep.'
              : 'The conversation has no completed idle turn yet.')
      }
      actions={actions}
      onClose={close}
    />
  )
}

async function loadContinuation(
  client: RpcClient,
  session: AiVaultSession,
  props: Pick<Props, 'activeWorktreeId' | 'hostPlatform' | 'worktrees'>
): Promise<ReadyContinuation | null> {
  const metadata = await loadMobileResumeMetadata(client)
  const target = resolveMobileAiVaultSessionResumeTarget({
    session,
    activeWorktreeId: props.activeWorktreeId,
    worktrees: metadata.worktrees ?? props.worktrees,
    repos: metadata.repos,
    folderWorkspaces: metadata.folderWorkspaces,
    projectGroups: metadata.projectGroups
  })
  if (!isSupportedMobileContinuationTarget(target, props.hostPlatform)) {
    return null
  }
  const source = mobileContinuationSource(
    session,
    session.structuredSession?.workspaceId ?? target.worktreeId
  )
  const view = await inspectMobileConversationContinuation(client, source)
  return { source, view, worktreeId: target.worktreeId }
}
