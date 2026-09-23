import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import type {
  AgentSessionBackgroundTask,
  AgentSessionBackgroundTaskState
} from '../../../src/shared/agent-session-wire'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

function taskLabel(task: AgentSessionBackgroundTask): string {
  if (task.description) {
    return task.description
  }
  switch (task.kind) {
    case 'agent':
      return 'Background agent'
    case 'workflow':
      return 'Background workflow'
    case 'command':
      return 'Background command'
    case 'monitor':
      return 'Background monitor'
    case 'unknown':
      return 'Background task'
  }
}

export function MobileNativeChatBackgroundTasksStatus({
  state,
  canStop,
  onStop,
  activeTurn
}: {
  state: AgentSessionBackgroundTaskState | null | undefined
  canStop: boolean
  onStop?: (taskId?: string) => Promise<boolean>
  activeTurn: boolean
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const [stopping, setStopping] = useState<string | null>(null)
  const tasks = state?.tasks ?? []
  const stop = (taskId?: string): void => {
    if (!onStop) {
      return
    }
    const key = taskId ?? 'all'
    setStopping(key)
    void onStop(taskId).finally(() => setStopping(null))
  }
  if (!state || !onStop || activeTurn) {
    return null
  }
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Monitoring background tasks"
        accessibilityState={{ expanded }}
        style={styles.header}
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.dot} />
        <Text style={styles.title}>Monitoring background tasks</Text>
        <ChevronDown
          size={15}
          color={colors.textMuted}
          style={expanded ? styles.expandedChevron : undefined}
        />
      </Pressable>
      {expanded ? (
        <ScrollView style={styles.details} nestedScrollEnabled>
          {tasks.length === 0 ? (
            <Text style={styles.detailText}>Task details are unavailable for this session.</Text>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <Text style={styles.taskText}>{taskLabel(task)}</Text>
                {state.supportsTaskStop ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Stop ${taskLabel(task)}`}
                    disabled={!canStop || stopping !== null}
                    onPress={() => stop(task.id)}
                  >
                    <Text style={[styles.stopText, !canStop && styles.disabledText]}>Stop</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
          {!state.supportsTaskStop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop background tasks"
              disabled={!canStop || stopping !== null}
              onPress={() => stop()}
              style={styles.stopAll}
            >
              <Text style={[styles.stopText, !canStop && styles.disabledText]}>Stop</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card
  },
  header: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.statusGreen
  },
  title: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.metaSize
  },
  expandedChevron: { transform: [{ rotate: '180deg' }] },
  details: {
    maxHeight: 160,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  detailText: { color: colors.textMuted, fontSize: typography.metaSize },
  taskRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  taskText: { flex: 1, color: colors.textPrimary, fontSize: typography.metaSize },
  stopText: { color: colors.textSecondary, fontSize: typography.metaSize },
  disabledText: { color: colors.textMuted },
  stopAll: { alignSelf: 'flex-start', paddingVertical: spacing.xs }
})
