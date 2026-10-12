import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, RefreshCw } from 'lucide-react-native'
import { useClipboardWriter } from '../platform/clipboard'
import type { BacklogTask } from '../../../src/shared/backlog-types'
import type { BacklogTaskOrder } from '../../../src/shared/backlog-task-order'
import { MobileMarkdown, type MobileMarkdownLinkTarget } from '../components/MobileMarkdown'
import { resolveMobileContextualFilePreview } from '../files/mobile-contextual-file-preview'
import {
  createMobileFilePreviewHref,
  displayNameFromPreviewPath
} from '../files/mobile-file-preview-route'
import { MobileLinkActionSheet } from '../session/MobileLinkActionSheet'
import type { MobileLinkActionTarget } from '../session/mobile-link-action-target'
import { useHostClient } from '../transport/client-context'
import { getWorktreeLabel } from '../session/worktree-label'
import { colors } from '../theme/mobile-theme'
import { mobileBacklogStatuses, selectMobileBacklogTasks } from './mobile-backlog-tasks'
import { backlogStyles as styles } from './mobile-backlog-styles'
import { useMobileBacklog } from './use-mobile-backlog'
import { MobileBacklogTaskAction } from './MobileBacklogTaskAction'

const ORDER_OPTIONS: { label: string; value: BacklogTaskOrder }[] = [
  { label: 'Board order', value: 'ordinal' },
  { label: 'ID', value: 'id' },
  { label: 'Priority', value: 'priority' }
]

export function MobileBacklogPanel({
  hostId,
  worktreeId,
  name
}: {
  hostId: string
  worktreeId: string
  name?: string
}) {
  const router = useRouter()
  const backlog = useMobileBacklog(hostId, worktreeId)
  const { client, state: connectionState } = useHostClient(hostId)
  const [linkTarget, setLinkTarget] = useState<MobileLinkActionTarget | null>(null)
  const clipboard = useClipboardWriter()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [order, setOrder] = useState<BacklogTaskOrder>('ordinal')
  const snapshot = backlog.screenState.kind === 'ready' ? backlog.screenState.snapshot : null
  const tasks = snapshot?.tasks ?? []
  const statuses = useMemo(() => mobileBacklogStatuses(tasks), [tasks])
  const visibleTasks = useMemo(
    () =>
      selectMobileBacklogTasks(tasks, { query, status, order, priorities: snapshot?.priorities }),
    [tasks, query, status, order, snapshot?.priorities]
  )
  const selected = backlog.selectedTaskId !== null
  const openFilePreview = async (pathText: string, allowOutside = false): Promise<void> => {
    if (!client || connectionState !== 'connected') {
      return
    }
    const result = await resolveMobileContextualFilePreview(client, worktreeId, {
      pathText,
      line: null,
      column: null
    })
    if (result.status !== 'resolved') {
      return
    }
    if (result.outsideWorkspace && !allowOutside) {
      setLinkTarget({ source: 'chat', kind: 'file', pathText })
      return
    }
    const source = result.source
    const base = {
      hostId,
      worktreeId: source.worktreeId,
      name: displayNameFromPreviewPath(result.displayPath),
      ...(result.line !== null ? { line: String(result.line) } : {})
    }
    router.push(
      createMobileFilePreviewHref(
        source.source === 'worktree'
          ? { ...base, source: 'worktree', relativePath: source.relativePath }
          : {
              ...base,
              source: 'terminalArtifact',
              absolutePath: source.absolutePath,
              grantId: source.grantId,
              pathText: source.pathText
            }
      )
    )
  }
  const showLinkActions = (target: MobileMarkdownLinkTarget): void => {
    setLinkTarget({ ...target, source: 'chat' })
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (selected ? backlog.setSelectedTaskId(null) : router.back())}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={selected ? 'Back to Backlog tasks' : 'Back to workspace'}
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {selected ? backlog.selectedTaskId : 'Backlog'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {getWorktreeLabel(name, worktreeId)}
          </Text>
        </View>
        <Pressable
          onPress={backlog.refresh}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh Backlog"
        >
          <RefreshCw size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {backlog.connState !== 'connected' ? (
        <Pressable
          style={styles.connectionBanner}
          onPress={backlog.retry}
          accessibilityRole="button"
        >
          <Text style={styles.connectionText}>Host disconnected · Tap to reconnect</Text>
        </Pressable>
      ) : null}

      {selected ? (
        <BacklogTaskDetail
          state={backlog.detailState}
          hostId={hostId}
          sourceWorkspaceId={worktreeId}
          taskActionsSupported={backlog.taskActionsSupported}
          onRetry={backlog.refresh}
          onOpenFile={(pathText) => void openFilePreview(pathText)}
          onShowLinkActions={showLinkActions}
        />
      ) : backlog.screenState.kind === 'unsupported' ? (
        <StateMessage
          title="Host update required"
          message="This host does not support Backlog tasks."
        />
      ) : backlog.screenState.kind === 'error' ? (
        <StateMessage
          title="Backlog unavailable"
          message={backlog.screenState.message}
          onRetry={backlog.retry}
        />
      ) : backlog.screenState.kind === 'loading' || snapshot?.state === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={styles.muted}>Loading Backlog…</Text>
        </View>
      ) : tasks.length === 0 ? (
        <StateMessage title="No Backlog tasks" message="This workspace has no tasks yet." />
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ID or title"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            accessibilityLabel="Search Backlog tasks"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <FilterChip label="All" selected={status === null} onPress={() => setStatus(null)} />
            {statuses.map((value) => (
              <FilterChip
                key={value}
                label={value}
                selected={status === value}
                onPress={() => setStatus(value)}
              />
            ))}
          </ScrollView>
          <View style={styles.orders}>
            {ORDER_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={order === option.value}
                onPress={() => setOrder(option.value)}
              />
            ))}
          </View>
          <FlatList
            data={visibleTasks}
            keyExtractor={(task) => task.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <BacklogTaskRow task={item} onPress={() => backlog.setSelectedTaskId(item.id)} />
            )}
            ListEmptyComponent={
              <StateMessage title="No matching tasks" message="Try another search or status." />
            }
          />
        </>
      )}
      <MobileLinkActionSheet
        target={linkTarget}
        client={client}
        connectionState={connectionState}
        worktreeId={worktreeId}
        preferredWebMode="phone-browser"
        canOpenOrcaBrowser={false}
        showAddToMessage={false}
        onClose={() => setLinkTarget(null)}
        onOpenFile={(target) => void openFilePreview(target.pathText, true)}
        onPreviewFile={(target) => void openFilePreview(target.pathText, true)}
        onOpenWeb={(target) => void Linking.openURL(target.url).catch(() => {})}
        onCopy={(target) =>
          void clipboard
            .writeText(target.kind === 'web' ? target.url : target.pathText)
            .catch(() => {})
        }
        onAddToMessage={() => {}}
      />
    </SafeAreaView>
  )
}

function FilterChip({
  label,
  selected,
  onPress
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function BacklogTaskRow({ task, onPress }: { task: BacklogTask; onPress: () => void }) {
  return (
    <Pressable
      style={styles.taskRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${task.id}: ${task.title}`}
    >
      <View style={styles.taskMeta}>
        <Text style={styles.taskId}>{task.id}</Text>
        <Text style={styles.taskStatus}>{task.status}</Text>
        {task.priority ? <Text style={styles.taskPriority}>{task.priority}</Text> : null}
      </View>
      <Text style={styles.taskTitle}>{task.title}</Text>
    </Pressable>
  )
}

function BacklogTaskDetail({
  state,
  hostId,
  sourceWorkspaceId,
  taskActionsSupported,
  onRetry,
  onOpenFile,
  onShowLinkActions
}: {
  state: ReturnType<typeof useMobileBacklog>['detailState']
  hostId: string
  sourceWorkspaceId: string
  taskActionsSupported: boolean | null
  onRetry: () => void
  onOpenFile: (pathText: string) => void
  onShowLinkActions: (target: MobileMarkdownLinkTarget) => void
}) {
  if (!state || state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    )
  }
  if (state.kind === 'error') {
    return <StateMessage title="Task unavailable" message={state.message} onRetry={onRetry} />
  }
  const { task } = state
  return (
    <ScrollView contentContainerStyle={styles.detail}>
      <Text style={styles.detailTitle}>{task.title}</Text>
      <View style={styles.taskMeta}>
        <Text style={styles.taskId}>{task.id}</Text>
        <Text style={styles.taskStatus}>{task.status}</Text>
        {task.priority ? <Text style={styles.taskPriority}>{task.priority}</Text> : null}
      </View>
      {task.description ? (
        <MobileMarkdown
          content={task.description}
          onOpenFile={onOpenFile}
          onShowLinkActions={onShowLinkActions}
        />
      ) : null}
      {task.acceptanceCriteria?.length ? (
        <View style={styles.criteria}>
          <Text style={styles.sectionTitle}>Acceptance criteria</Text>
          {task.acceptanceCriteria.map((criterion) => (
            <View key={criterion.index} style={styles.criterion}>
              <View style={[styles.checkbox, criterion.checked && styles.checkboxChecked]}>
                {criterion.checked ? <Check size={13} color={colors.onAccent} /> : null}
              </View>
              <View style={styles.criterionText}>
                <MobileMarkdown
                  content={criterion.text}
                  onOpenFile={onOpenFile}
                  onShowLinkActions={onShowLinkActions}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <MobileBacklogTaskAction
        hostId={hostId}
        sourceWorkspaceId={sourceWorkspaceId}
        task={task}
        supported={taskActionsSupported}
      />
    </ScrollView>
  )
}

function StateMessage({
  title,
  message,
  onRetry
}: {
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
