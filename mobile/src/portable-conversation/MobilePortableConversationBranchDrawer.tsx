import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import type {
  PortableConversationBranchPrepareParams,
  PortableConversationBranchPreviewResult,
  PortableConversationBranchRecord
} from '../../../src/shared/portable-conversation-branch'
import type { PortableConversationSourceAnchor } from '../../../src/shared/portable-conversation-source'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import {
  createMobilePortableConversationId,
  targetedMobilePortableHandoff,
  type MobilePortableConversationRoute
} from './mobile-portable-conversation'
import {
  prepareMobilePortableBranch,
  previewMobilePortableBranch,
  startMobilePortableBranch
} from './mobile-portable-conversation-rpc'
import { portableStyles as styles } from './mobile-portable-conversation-styles'

type Mode = 'history' | 'targeted'

type Props = {
  visible: boolean
  client: RpcClient | null
  route: MobilePortableConversationRoute
  anchor: PortableConversationSourceAnchor
  onClose: () => void
  onOpenTarget: (worktreeId: string, message: string) => void
}

export function MobilePortableConversationBranchDrawer(props: Props): React.JSX.Element {
  const [title, setTitle] = useState('Related SSH conversation')
  const [workspaceId, setWorkspaceId] = useState(props.route.sourceWorktree.worktreeId)
  const [mode, setMode] = useState<Mode>('history')
  const [preview, setPreview] = useState<PortableConversationBranchPreviewResult | null>(null)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyBlocked, setHistoryBlocked] = useState(false)
  const [prepared, setPrepared] = useState<PortableConversationBranchRecord | null>(null)
  const [startedWorktreeId, setStartedWorktreeId] = useState<string | null>(null)
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null)
  const intentRef = useRef<PortableConversationBranchPrepareParams | null>(null)
  const attemptIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    setPreview(null)
    setError(null)
    if (!props.visible || !props.client || prepared || intentRef.current) {
      return
    }
    void previewMobilePortableBranch(props.client, {
      source: props.route.source,
      anchor: props.anchor,
      mode
    })
      .then((result) => {
        if (generationRef.current !== generation) {
          return
        }
        if (mode === 'history' && result.context.historyTruncated) {
          setHistoryBlocked(true)
          setMode('targeted')
          return
        }
        setPreview(result)
        setContent(
          mode === 'targeted'
            ? targetedMobilePortableHandoff(result.context.contextMarkdown)
            : result.context.contextMarkdown
        )
      })
      .catch((failure: unknown) => {
        if (generationRef.current === generation) {
          setError(failure instanceof Error ? failure.message : 'Unable to verify source context.')
        }
      })
  }, [mode, prepared, props.anchor, props.client, props.route.source, props.visible])

  const prepare = async (): Promise<void> => {
    if (!props.client || !preview || !title.trim() || !content.trim() || busy) {
      return
    }
    const target = props.route.targetWorktrees.find((item) => item.worktreeId === workspaceId)
    if (!target) {
      setError('The target workspace is unavailable on this execution host.')
      return
    }
    intentRef.current ??= {
      branchId: createMobilePortableConversationId('portable-branch'),
      title: title.trim(),
      relationKind: 'discussion',
      source: props.route.source,
      anchor: props.anchor,
      target: {
        sessionId: createMobilePortableConversationId('portable'),
        agent: props.route.source.provider.agent,
        workspaceId: target.worktreeId,
        executionHostId: props.route.source.executionHostId
      },
      handoff: { mode, content, sourceContextSha256: preview.contextSha256 }
    }
    setBusy(true)
    setError(null)
    try {
      const result = await prepareMobilePortableBranch(props.client, intentRef.current)
      setPrepared(result.branch)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Preparation could not be confirmed.')
    } finally {
      setBusy(false)
    }
  }

  const start = async (): Promise<void> => {
    if (!props.client || !prepared || busy) {
      return
    }
    attemptIdRef.current ??= createMobilePortableConversationId('portable-start')
    setBusy(true)
    setError(null)
    try {
      const result = await startMobilePortableBranch({
        client: props.client,
        branchId: prepared.branchId,
        attemptId: attemptIdRef.current
      })
      setPrepared(result.branch)
      setStartedWorktreeId(result.worktreeId)
      setDeliveryMessage(
        result.outcome === 'accepted'
          ? 'The provider accepted the handoff.'
          : result.outcome === 'rejected'
            ? 'The saved start attempt was rejected. Orca will not repeat it automatically.'
            : result.hasReceipt
              ? 'Terminal navigation is saved, but provider delivery is unverified. Orca will not send the handoff again automatically.'
              : 'The start outcome is unverified. Orca will not create a terminal or send the handoff again automatically.'
      )
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Conversation start is unverified and will not be repeated automatically.'
      )
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || intentRef.current !== null
  const cannotDismiss = busy || (intentRef.current !== null && !prepared)
  return (
    <BottomDrawer
      visible={props.visible}
      onClose={() => !cannotDismiss && props.onClose()}
      fillAvailable
      dragContentToDismiss={!cannotDismiss}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Prepare related SSH conversation</Text>
          <Text style={styles.description}>
            Review the exact portable context. Current target files are used; no checkout is
            restored.
          </Text>
        </View>
        {prepared ? (
          <PreparedBranch
            branch={prepared}
            busy={busy}
            deliveryMessage={deliveryMessage}
            startedWorktreeId={startedWorktreeId}
            onStart={() => void start()}
            onOpenTarget={() =>
              startedWorktreeId &&
              props.onOpenTarget(startedWorktreeId, deliveryMessage ?? 'Conversation prepared.')
            }
          />
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                editable={!locked}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Portable context</Text>
              <View style={styles.choiceRow}>
                <ModeChoice
                  label="History through response"
                  active={mode === 'history'}
                  disabled={locked || historyBlocked}
                  onPress={() => setMode('history')}
                />
                <ModeChoice
                  label="Targeted response"
                  active={mode === 'targeted'}
                  disabled={locked}
                  onPress={() => setMode('targeted')}
                />
              </View>
              <Text style={styles.description}>
                {mode === 'history'
                  ? 'A bounded transcript copy through the selected response.'
                  : 'A focused handoff around the selected response.'}
              </Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Target workspace on the same execution host</Text>
              {props.route.targetWorktrees.map((worktree) => (
                <Pressable
                  key={`${String(worktree.hostId)}:${worktree.worktreeId}`}
                  style={[
                    styles.workspace,
                    workspaceId === worktree.worktreeId && styles.workspaceActive
                  ]}
                  disabled={locked}
                  onPress={() => setWorkspaceId(worktree.worktreeId)}
                >
                  <Text style={styles.workspaceTitle}>{worktree.displayName || worktree.repo}</Text>
                  <Text style={styles.mono} numberOfLines={1}>
                    {worktree.path}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Exact editable handoff</Text>
              <TextInput
                style={[styles.input, styles.contextInput]}
                value={content}
                editable={!locked && !!preview}
                multiline
                onChangeText={setContent}
                placeholder="Loading verified source context…"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </>
        )}
        {historyBlocked ? (
          <Text style={styles.statusText}>
            Full history exceeded the safe bound. Review the targeted handoff instead.
          </Text>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.textSecondary} /> : null}
        {!prepared ? (
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                (!preview || busy || !content.trim()) && styles.buttonDisabled,
                pressed && styles.buttonPressed
              ]}
              disabled={!preview || busy || !content.trim()}
              onPress={() => void prepare()}
            >
              <Text style={styles.primaryButtonText}>
                {intentRef.current ? 'Check preparation' : 'Prepare conversation'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </BottomDrawer>
  )
}

function ModeChoice(props: {
  label: string
  active: boolean
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      style={[
        styles.choice,
        props.active && styles.choiceActive,
        props.disabled && styles.buttonDisabled
      ]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={[styles.choiceText, props.active && styles.choiceTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

function PreparedBranch(props: {
  branch: PortableConversationBranchRecord
  busy: boolean
  deliveryMessage: string | null
  startedWorktreeId: string | null
  onStart: () => void
  onOpenTarget: () => void
}): React.JSX.Element {
  return (
    <>
      <View style={styles.evidence}>
        <Text style={styles.label}>Prepared handoff</Text>
        <Text style={styles.messageText}>{props.branch.handoff.content}</Text>
      </View>
      {props.deliveryMessage ? (
        <View style={styles.status}>
          <Text style={styles.statusText}>{props.deliveryMessage}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {props.startedWorktreeId ? (
          <Pressable style={styles.button} onPress={props.onOpenTarget}>
            <Text style={styles.buttonText}>Open target workspace</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.primaryButton, props.busy && styles.buttonDisabled]}
            disabled={props.busy}
            onPress={props.onStart}
          >
            <Text style={styles.primaryButtonText}>Start work</Text>
          </Pressable>
        )}
      </View>
    </>
  )
}
