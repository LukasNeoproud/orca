import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { BacklogTaskAssociation } from '../../../src/shared/backlog-task-association'
import type { BacklogTask } from '../../../src/shared/backlog-types'
import { triggerError, triggerSuccess } from '../platform/haptics'
import { useHostClient } from '../transport/client-context'
import { colors } from '../theme/mobile-theme'
import { readMobileBacklogTaskAssociation } from './mobile-backlog-task-association-client'
import { continueMobileBacklogTask } from './mobile-backlog-task-continue'
import type { MobileBacklogTaskLaunchOutcome } from './mobile-backlog-task-launch'
import { MobileBacklogTaskLaunchSheet } from './MobileBacklogTaskLaunchSheet'
import { backlogStyles as styles } from './mobile-backlog-styles'

export function MobileBacklogTaskAction(props: {
  hostId: string
  sourceWorkspaceId: string
  task: BacklogTask
  supported: boolean | null
}) {
  const { client, state } = useHostClient(props.hostId)
  const router = useRouter()
  const [association, setAssociation] = useState<BacklogTaskAssociation | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!props.supported || !client || state !== 'connected') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void readMobileBacklogTaskAssociation(client, props.sourceWorkspaceId, props.task.id)
      .then((saved) => {
        if (!cancelled) {
          setAssociation(saved)
          setUnavailable(false)
          setError(null)
        }
      })
      .catch((failure) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'Unable to load task link.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, props.sourceWorkspaceId, props.supported, props.task.id, state])

  const openWorkspace = (worktreeId: string): void => {
    router.push(
      `/h/${encodeURIComponent(props.hostId)}/session/${encodeURIComponent(worktreeId)}` as Parameters<
        typeof router.push
      >[0]
    )
  }

  const continueTask = async (): Promise<void> => {
    if (!client || !association || inFlightRef.current) {
      return
    }
    inFlightRef.current = true
    setBusy(true)
    setError(null)
    try {
      const outcome = await continueMobileBacklogTask({
        client,
        sourceWorkspaceId: props.sourceWorkspaceId,
        association
      })
      setAssociation(outcome.association)
      setMessage(outcome.message)
      if (outcome.status === 'activated' || outcome.status === 'restored') {
        triggerSuccess()
        openWorkspace(outcome.worktreeId)
      } else {
        triggerError()
        setUnavailable(outcome.status === 'unavailable')
        setError(outcome.message)
      }
    } catch (failure) {
      triggerError()
      setError(failure instanceof Error ? failure.message : 'Unable to open conversation.')
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  const onLaunched = (outcome: MobileBacklogTaskLaunchOutcome): void => {
    setAssociation(outcome.association)
    setUnavailable(false)
    setMessage(outcome.message)
    setLauncherOpen(false)
    triggerSuccess()
    if (outcome.opened) {
      openWorkspace(outcome.worktreeId)
    }
  }

  if (props.supported === false) {
    return (
      <View style={styles.taskActionCard}>
        <Text style={styles.taskActionTitle}>Host update required</Text>
        <Text style={styles.taskActionText}>Update Orca on this host to start Backlog tasks.</Text>
      </View>
    )
  }
  return (
    <View style={styles.taskActionCard}>
      <Text style={styles.taskActionTitle}>Conversation</Text>
      {loading || props.supported === null ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : association ? (
        <View style={styles.taskAssociationMeta}>
          <Text style={styles.taskActionText} numberOfLines={2}>
            {association.session.title || association.session.agent || 'Linked conversation'}
          </Text>
          <Text style={styles.taskActionMeta}>{association.targetWorkspace.workspaceId}</Text>
          {association.deliveryStatus !== 'confirmed' ? (
            <Text style={styles.taskActionWarning}>
              Delivery is unverified. Continue will not resend the task.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.taskActionText}>Choose where to hand this task to an agent.</Text>
      )}
      {message && !error ? <Text style={styles.taskActionMeta}>{message}</Text> : null}
      {error ? <Text style={styles.taskActionError}>{error}</Text> : null}
      <View style={styles.taskActionButtons}>
        <Pressable
          style={({ pressed }) => [styles.taskPrimaryButton, pressed && styles.buttonPressed]}
          disabled={busy || loading || !client || state !== 'connected'}
          onPress={() =>
            association && !unavailable ? void continueTask() : setLauncherOpen(true)
          }
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bgBase} />
          ) : (
            <Text style={styles.taskPrimaryButtonText}>
              {association && !unavailable
                ? 'Continue'
                : association
                  ? 'Choose another'
                  : 'Start task'}
            </Text>
          )}
        </Pressable>
        {association && !unavailable ? (
          <Pressable
            style={({ pressed }) => [styles.taskSecondaryButton, pressed && styles.buttonPressed]}
            disabled={busy}
            onPress={() => setLauncherOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.taskSecondaryButtonText}>Choose another</Text>
          </Pressable>
        ) : null}
      </View>
      <MobileBacklogTaskLaunchSheet
        visible={launcherOpen}
        client={client}
        sourceWorkspaceId={props.sourceWorkspaceId}
        task={props.task}
        association={association}
        onClose={() => setLauncherOpen(false)}
        onLaunched={onLaunched}
        onAssociationRecovered={(saved, recoveryMessage) => {
          setAssociation(saved)
          setMessage(recoveryMessage)
          setLauncherOpen(false)
        }}
      />
    </View>
  )
}
