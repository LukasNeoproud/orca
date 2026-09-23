import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { isAgentSessionHandleProvider } from '../../../src/shared/agent-session-provider-handle'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import type { BacklogTask } from '../../../src/shared/backlog-types'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileNewTabAgentOption } from '../session/mobile-new-tab-agent-options'
import type { Worktree } from '../worktree/workspace-list-types'
import { colors } from '../theme/mobile-theme'
import { readMobileBacklogTaskAssociation } from './mobile-backlog-task-association-client'
import {
  loadMobileBacklogAgents,
  loadMobileBacklogConversations,
  loadMobileBacklogWorkspaces
} from './mobile-backlog-task-catalog'
import {
  startMobileBacklogTask,
  type MobileBacklogConversationChoice,
  type MobileBacklogTaskLaunchOutcome
} from './mobile-backlog-task-launch'
import type { MobileBacklogConversationOption } from './mobile-backlog-task-options'
import { backlogStyles as styles } from './mobile-backlog-styles'

type ChoiceId = 'new-terminal' | 'new-chat' | string

export function MobileBacklogTaskLaunchSheet(props: {
  visible: boolean
  client: RpcClient | null
  sourceWorkspaceId: string
  task: BacklogTask
  association: BacklogTaskAssociation | null
  onClose: () => void
  onLaunched: (outcome: MobileBacklogTaskLaunchOutcome) => void
  onAssociationRecovered: (association: BacklogTaskAssociation, message: string) => void
}) {
  const [workspaces, setWorkspaces] = useState<Worktree[]>([])
  const [workspaceId, setWorkspaceId] = useState(props.sourceWorkspaceId)
  const [conversations, setConversations] = useState<MobileBacklogConversationOption[]>([])
  const [agents, setAgents] = useState<MobileNewTabAgentOption[]>([])
  const [agentId, setAgentId] = useState<MobileNewTabAgentOption['agent'] | null>(null)
  const [choiceId, setChoiceId] = useState<ChoiceId>('new-terminal')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadGenerationRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!props.visible) {
      loadGenerationRef.current += 1
    }
  }, [props.visible])

  useEffect(() => {
    if (!props.visible || !props.client) {
      return
    }
    const generation = ++loadGenerationRef.current
    setLoading(true)
    setBlocked(false)
    setError(null)
    void loadMobileBacklogWorkspaces(props.client, props.sourceWorkspaceId)
      .then((next) => {
        if (generation !== loadGenerationRef.current) {
          return
        }
        setWorkspaces(next)
        setWorkspaceId(
          next.some((workspace) => workspace.worktreeId === props.sourceWorkspaceId)
            ? props.sourceWorkspaceId
            : (next[0]?.worktreeId ?? props.sourceWorkspaceId)
        )
      })
      .catch((failure) => {
        if (generation === loadGenerationRef.current) {
          setError(failure instanceof Error ? failure.message : 'Unable to load workspaces.')
        }
      })
      .finally(() => {
        if (generation === loadGenerationRef.current) {
          setLoading(false)
        }
      })
  }, [props.client, props.sourceWorkspaceId, props.visible])

  const workspace = useMemo(
    () => workspaces.find((candidate) => candidate.worktreeId === workspaceId) ?? null,
    [workspaceId, workspaces]
  )
  useEffect(() => {
    if (!props.visible || !props.client || !workspace) {
      return
    }
    const generation = ++loadGenerationRef.current
    setLoading(true)
    setError(null)
    setChoiceId('new-terminal')
    setConversations([])
    setAgents([])
    void Promise.allSettled([
      loadMobileBacklogConversations(props.client, workspace.worktreeId),
      loadMobileBacklogAgents(props.client, workspace)
    ])
      .then(([conversationResult, agentResult]) => {
        if (generation !== loadGenerationRef.current) {
          return
        }
        const nextConversations =
          conversationResult.status === 'fulfilled' ? conversationResult.value : []
        const nextAgents = agentResult.status === 'fulfilled' ? agentResult.value : []
        setConversations(nextConversations)
        setAgents(nextAgents)
        setAgentId(nextAgents[0]?.agent ?? null)
        const failure =
          conversationResult.status === 'rejected'
            ? conversationResult.reason
            : agentResult.status === 'rejected'
              ? agentResult.reason
              : null
        if (failure) {
          setError(
            failure instanceof Error ? failure.message : 'Some launch options are unavailable.'
          )
        }
      })
      .finally(() => {
        if (generation === loadGenerationRef.current) {
          setLoading(false)
        }
      })
  }, [props.client, props.visible, workspace])

  const conversationChoice = (): MobileBacklogConversationChoice | null => {
    if (choiceId === 'new-terminal' || choiceId === 'new-chat') {
      return agentId ? { kind: choiceId, agent: agentId } : null
    }
    const conversation = conversations.find((candidate) => candidate.id === choiceId)
    return conversation ? { kind: 'existing', conversation } : null
  }

  const submit = async (): Promise<void> => {
    const choice = conversationChoice()
    if (!props.client || !choice || inFlightRef.current || blocked) {
      return
    }
    inFlightRef.current = true
    setBusy(true)
    setError(null)
    try {
      const outcome = await startMobileBacklogTask({
        client: props.client,
        sourceWorkspaceId: props.sourceWorkspaceId,
        taskId: props.task.id,
        targetWorkspaceId: workspaceId,
        conversation: choice,
        expectedAttemptId: props.association?.attemptId ?? null
      })
      props.onLaunched(outcome)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unable to start task.'
      try {
        const saved = await readMobileBacklogTaskAssociation(
          props.client,
          props.sourceWorkspaceId,
          props.task.id
        )
        if (saved && saved.attemptId !== props.association?.attemptId) {
          props.onAssociationRecovered(
            saved,
            'Delivery is unverified. Continue will not resend the task.'
          )
          return
        }
      } catch {
        setBlocked(true)
        setError('The result is unverifiable. Reconnect before starting another attempt.')
        return
      }
      setError(message)
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose} dragContentToDismiss>
      <Text style={styles.launchTitle}>Start task</Text>
      <Text style={styles.launchSubtitle}>
        {props.task.id} · {props.task.title}
      </Text>
      {loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
      <Text style={styles.launchLabel}>Workspace</Text>
      <View style={styles.launchOptions}>
        {workspaces.map((candidate) => (
          <SelectionButton
            key={candidate.worktreeId}
            label={candidate.displayName || candidate.branch || candidate.worktreeId}
            selected={candidate.worktreeId === workspaceId}
            onPress={() => setWorkspaceId(candidate.worktreeId)}
          />
        ))}
      </View>
      <Text style={styles.launchLabel}>Conversation</Text>
      <View style={styles.launchOptions}>
        <SelectionButton
          label="New agent terminal"
          selected={choiceId === 'new-terminal'}
          onPress={() => setChoiceId('new-terminal')}
        />
        {agentId && isAgentSessionHandleProvider(agentId) ? (
          <SelectionButton
            label="New chat"
            selected={choiceId === 'new-chat'}
            onPress={() => setChoiceId('new-chat')}
          />
        ) : null}
        {conversations.map((conversation) => (
          <SelectionButton
            key={conversation.id}
            label={conversation.title}
            hint={conversation.surface === 'structured' ? 'Chat' : 'Terminal'}
            selected={choiceId === conversation.id}
            onPress={() => setChoiceId(conversation.id)}
          />
        ))}
      </View>
      {choiceId === 'new-terminal' || choiceId === 'new-chat' ? (
        <>
          <Text style={styles.launchLabel}>Agent</Text>
          <View style={styles.launchAgentRow}>
            {agents.map((agent) => (
              <SelectionButton
                key={agent.agent}
                label={agent.label}
                selected={agentId === agent.agent}
                compact
                onPress={() => setAgentId(agent.agent)}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.launchNotice}>
        The latest task details will be sent once. Terminal delivery remains unverified.
      </Text>
      {error ? <Text style={styles.taskActionError}>{error}</Text> : null}
      <View style={styles.launchFooter}>
        <Pressable style={styles.taskSecondaryButton} disabled={busy} onPress={props.onClose}>
          <Text style={styles.taskSecondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.taskPrimaryButton, pressed && styles.buttonPressed]}
          disabled={busy || loading || blocked || !conversationChoice()}
          onPress={() => void submit()}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bgBase} />
          ) : (
            <Text style={styles.taskPrimaryButtonText}>Start task</Text>
          )}
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

function SelectionButton(props: {
  label: string
  hint?: string
  selected: boolean
  compact?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.launchOption,
        props.compact && styles.launchOptionCompact,
        props.selected && styles.launchOptionSelected,
        pressed && styles.buttonPressed
      ]}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
    >
      <Text style={[styles.launchOptionText, props.selected && styles.launchOptionTextSelected]}>
        {props.label}
      </Text>
      {props.hint ? <Text style={styles.taskActionMeta}>{props.hint}</Text> : null}
    </Pressable>
  )
}
