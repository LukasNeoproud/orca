import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session-wire'
import type { ConversationContinuationSource } from '../../../src/shared/conversation-continuation'
import {
  CONVERSATION_CONTINUATION_CAPABILITY,
  type ConversationContinuationView
} from '../../../src/shared/conversation-continuation-view'
import {
  AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import {
  inspectMobileConversationContinuation,
  launchMobileConversationContinuation,
  MobileContinuationCancelledError
} from '../agent-history/mobile-agent-history-continuation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { startRuntimeCapabilityProbe } from '../transport/runtime-capability-probe'
import type { RpcClient } from '../transport/rpc-client'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import { MobileStructuredContextRequestStatus } from './MobileStructuredContextRequestStatus'
import { stageMobileStructuredContinuationDraft } from './mobile-structured-continuation-draft'

type Ready = { source: ConversationContinuationSource; view: ConversationContinuationView }

export function MobileStructuredContinuationPanel(props: {
  client: RpcClient | null
  connected: boolean
  hostId: string
  worktreeId: string
  sessionId: string | null
  agent: string | null
  busy: boolean
  draft: string
  onOpened: (sessionId: string) => void | Promise<void>
}): React.JSX.Element | null {
  const { client, connected, hostId, worktreeId, sessionId, agent, busy, draft, onOpened } = props
  const [supported, setSupported] = useState(false)
  const [source, setSource] = useState<ConversationContinuationSource | null>(null)
  const [ready, setReady] = useState<Ready | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const generation = useRef(0)
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    generation.current += 1
    const current = generation.current
    setSupported(false)
    setSource(null)
    setReady(null)
    setExpanded(false)
    setPending(false)
    setMessage(null)
    if (!client || !connected || !sessionId || agent !== 'codex') {
      return
    }
    return startRuntimeCapabilityProbe(client, (capabilities) => {
      const continuationSupported = [
        CONVERSATION_CONTINUATION_CAPABILITY,
        STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_REVEAL_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_RESUME_HISTORY_RUNTIME_CAPABILITY
      ].every((capability) => capabilities.includes(capability))
      if (
        !continuationSupported &&
        !capabilities.includes(AGENT_CONTEXT_TRANSITIONS_RUNTIME_CAPABILITY)
      ) {
        return
      }
      setSupported(continuationSupported)
      void callAgentSession<{ supported: boolean }>(client, 'agentSession.createSupport', {
        worktree: `id:${worktreeId}`,
        agent: 'codex'
      })
        .then((support) =>
          support.supported && current === generation.current
            ? callAgentSession<AgentSessionHistoryResult>(client, 'agentSession.history', {
                sessionId,
                direction: 'tail',
                limit: 1
              })
            : null
        )
        .then(async (history) => {
          if (!history) {
            return
          }
          const provider = history.providerSession
          if (provider?.key !== 'session_id' || current !== generation.current) {
            return
          }
          const source = { providerSessionId: provider.id, workspaceId: worktreeId }
          setSource(source)
          if (!continuationSupported) {
            return
          }
          const view = await inspectMobileConversationContinuation(client, source)
          if (current === generation.current) {
            setReady({ source, view })
          }
        })
        .catch((error: unknown) => {
          if (current === generation.current) {
            setMessage(error instanceof Error ? error.message : 'Could not inspect continuation.')
          }
        })
    })
  }, [agent, client, connected, sessionId, worktreeId])

  useEffect(() => {
    if (!client || !ready || !supported) {
      return
    }
    const current = generation.current
    const timer = setInterval(
      () => {
        void inspectMobileConversationContinuation(client, ready.source)
          .then((view) => {
            if (current === generation.current) {
              setReady((value) => (value ? { ...value, view } : value))
            }
          })
          .catch(() => {})
      },
      ready.view.candidate?.status === 'preparing' ? 2_000 : 15_000
    )
    return () => clearInterval(timer)
  }, [
    client,
    ready?.source.providerSessionId,
    ready?.source.workspaceId,
    ready?.view.candidate?.status,
    supported
  ])

  const choose = useCallback(
    async (mode: 'original' | 'compacted' | 'reference' | 'fresh') => {
      if (!client || !ready || pending || busyRef.current) {
        return
      }
      if (mode === 'original') {
        setExpanded(false)
        setMessage(null)
        return
      }
      const current = generation.current
      setPending(true)
      setMessage(null)
      try {
        const result = await launchMobileConversationContinuation({
          client,
          hostId,
          worktreeId,
          source: ready.source,
          mode,
          isCurrent: () => generation.current === current && !busyRef.current
        })
        if (result.kind === 'opened') {
          stageMobileStructuredContinuationDraft(hostId, result.sessionId, draft)
          await onOpened(result.sessionId)
        } else if (result.kind === 'preparing') {
          setReady((value) =>
            value ? { ...value, view: { ...value.view, candidate: result.candidate } } : value
          )
          setMessage('Preparing a compact copy…')
        } else {
          setMessage(result.message)
        }
      } catch (error) {
        if (
          generation.current === current &&
          !(error instanceof MobileContinuationCancelledError)
        ) {
          setMessage(error instanceof Error ? error.message : 'Conversation continuation failed.')
        }
      } finally {
        if (generation.current === current) {
          setPending(false)
        }
      }
    },
    [client, draft, hostId, onOpened, pending, ready, worktreeId]
  )

  if (!source) {
    return null
  }
  if (!supported || !ready) {
    return client ? <MobileStructuredContextRequestStatus client={client} source={source} /> : null
  }
  const candidate = ready.view.candidate
  const preparing = candidate?.status === 'preparing'
  const locked = busy || pending
  return (
    <>
      {client ? (
        <MobileStructuredContextRequestStatus client={client} source={ready.source} />
      ) : null}
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversation continuation"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.header}
        >
          <ChevronDown
            size={14}
            color={colors.textMuted}
            style={expanded ? styles.expandedChevron : undefined}
          />
          <Text style={styles.headerText}>Conversation continuation</Text>
          {preparing ? <Text style={styles.meta}>Preparing…</Text> : null}
        </Pressable>
        {expanded ? (
          <View style={styles.body}>
            <View style={styles.actions}>
              <Choice
                label="Continue original"
                disabled={locked}
                onPress={() => void choose('original')}
              />
              <Choice
                label={candidate?.status === 'ready' ? 'Continue compacted' : 'Compact a copy'}
                disabled={
                  locked || preparing || !ready.view.checkpoint || candidate?.status === 'used'
                }
                onPress={() => void choose('compacted')}
              />
              <Choice
                label="New with reference"
                disabled={locked || !ready.view.checkpoint}
                onPress={() => void choose('reference')}
              />
              <Choice
                label="New conversation"
                disabled={locked}
                onPress={() => void choose('fresh')}
              />
            </View>
            <Text style={styles.meta}>
              {busy
                ? 'Finish or stop the current turn before switching.'
                : draft.trim()
                  ? 'The typed message is copied into the new conversation. The original is preserved.'
                  : 'The original conversation is preserved. Preparing a copy uses model tokens.'}
            </Text>
            {candidate?.status === 'used' ? (
              <Text style={styles.meta}>
                This copy was already selected. Reopen it from Session History if switching was
                interrupted.
              </Text>
            ) : null}
            {message ? <Text style={styles.error}>{message}</Text> : null}
          </View>
        ) : null}
      </View>
    </>
  )
}

function Choice(props: {
  label: string
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.choice, props.disabled && styles.disabled]}
    >
      <Text style={styles.choiceText}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  header: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  expandedChevron: { transform: [{ rotate: '180deg' }] },
  body: { gap: spacing.sm, paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  disabled: { opacity: 0.45 },
  choiceText: { color: colors.textPrimary, fontSize: typography.metaSize },
  meta: { color: colors.textMuted, fontSize: typography.metaSize },
  error: { color: colors.statusRed, fontSize: typography.metaSize }
})
