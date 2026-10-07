import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  HostProcessEntry,
  HostProcessTerminationVerdict
} from '../../../src/shared/host-system-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { formatBytes, formatRate, sortProcesses, type ProcessSort } from './host-system-format'
import { hostSystemStyles } from './host-system-sections'

const VISIBLE_ROWS = 25
const VERDICT_MESSAGES: Record<HostProcessTerminationVerdict, string> = {
  exited: 'The process has exited.',
  live: 'The process is still running. You can force stop it.',
  unverifiable: 'The host could not confirm whether the process stopped.'
}

export function HostProcessCard(props: {
  processes: readonly HostProcessEntry[]
  disabled: boolean
  onTerminate: (
    entry: HostProcessEntry,
    force: boolean
  ) => Promise<HostProcessTerminationVerdict | null>
}) {
  const [sort, setSort] = useState<ProcessSort>('cpu')
  const hasNetwork = props.processes.some((entry) => entry.networkBytesPerSecond !== null)
  const sorts: ProcessSort[] = hasNetwork ? ['cpu', 'memory', 'network'] : ['cpu', 'memory']
  const rows = sortProcesses(props.processes, sort).slice(0, VISIBLE_ROWS)

  const terminate = async (entry: HostProcessEntry, force: boolean): Promise<void> => {
    const verdict = await props.onTerminate(entry, force)
    if (verdict) {
      Alert.alert(entry.name, VERDICT_MESSAGES[verdict])
    }
  }

  const confirm = (entry: HostProcessEntry): void => {
    Alert.alert(
      `Stop ${entry.name}?`,
      `PID ${entry.pid}. Unsaved work in this process may be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', onPress: () => void terminate(entry, false) },
        { text: 'Force stop', style: 'destructive', onPress: () => void terminate(entry, true) }
      ]
    )
  }

  return (
    <View style={hostSystemStyles.card}>
      <Text style={hostSystemStyles.title}>Processes</Text>
      <View style={styles.sorts}>
        {sorts.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === option }}
            onPress={() => setSort(option)}
            style={[styles.sort, sort === option && styles.sortSelected]}
          >
            <Text style={[styles.sortText, sort === option && styles.sortTextSelected]}>
              {option === 'cpu' ? 'CPU' : option === 'memory' ? 'Memory' : 'Network'}
            </Text>
          </Pressable>
        ))}
      </View>
      {rows.map((entry) => (
        <Pressable
          key={entry.pid}
          accessibilityRole="button"
          accessibilityHint="Stop this process"
          disabled={props.disabled}
          onPress={() => confirm(entry)}
          style={styles.row}
        >
          <Text style={styles.name} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.metric}>{entry.cpuPercent.toFixed(1)}%</Text>
          <Text style={styles.metric}>{formatBytes(entry.memoryBytes)}</Text>
          {hasNetwork ? (
            <Text style={styles.metric}>{formatRate(entry.networkBytesPerSecond ?? 0)}</Text>
          ) : null}
        </Pressable>
      ))}
      <Text style={hostSystemStyles.muted}>Tap a process to stop it.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sorts: { flexDirection: 'row', gap: spacing.sm },
  sort: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.button,
    backgroundColor: colors.bgRaised
  },
  sortSelected: { backgroundColor: colors.surfaceBright },
  sortText: { color: colors.textSecondary, fontSize: typography.metaSize },
  sortTextSelected: { color: colors.bgBase, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  name: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize },
  metric: {
    width: 64,
    textAlign: 'right',
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  }
})
