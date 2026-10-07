import { Pressable, StyleSheet, Text, View } from 'react-native'
import type {
  HostDiskVolume,
  HostSwitchablePowerMode,
  HostSystemSnapshot
} from '../../../src/shared/host-system-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  DISK_LEVEL_COLORS,
  formatBytes,
  formatFullIn,
  POWER_MODE_LABELS,
  THERMAL_COLORS,
  THERMAL_LABELS
} from './host-system-format'

const SWITCHABLE_MODES: HostSwitchablePowerMode[] = ['automatic', 'low-power']

export function HostStatusCard({ snapshot }: { snapshot: HostSystemSnapshot }) {
  const thermal = snapshot.thermalState
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Battery</Text>
        <Text style={styles.value}>
          {snapshot.battery
            ? `${snapshot.battery.percent}%${snapshot.battery.charging ? ' · charging' : ''}`
            : 'No battery'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Temperature</Text>
        {thermal ? (
          <View style={styles.inline}>
            <View style={[styles.dot, { backgroundColor: THERMAL_COLORS[thermal] }]} />
            <Text style={styles.value}>{THERMAL_LABELS[thermal]}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>Not reported by this host</Text>
        )}
      </View>
    </View>
  )
}

export function PowerModeCard(props: {
  snapshot: HostSystemSnapshot
  disabled: boolean
  onSelect: (mode: HostSwitchablePowerMode) => void
}) {
  const powerMode = props.snapshot.powerMode
  if (!powerMode) {
    return null
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Power mode</Text>
      <View style={styles.segment}>
        {SWITCHABLE_MODES.map((mode) => {
          const selected = powerMode.current === mode
          const disabled = props.disabled || !powerMode.switchable || selected
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => props.onSelect(mode)}
              style={[styles.segmentItem, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {POWER_MODE_LABELS[mode]}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {powerMode.current === 'high-power' ? (
        <Text style={styles.muted}>Currently in High Power mode.</Text>
      ) : null}
      {!powerMode.switchable ? (
        <Text style={styles.muted}>
          To switch from this phone, choose Allow in Orca Settings → Mobile → Host Power Control on
          the Mac.
        </Text>
      ) : null}
    </View>
  )
}

function DiskRow({ disk }: { disk: HostDiskVolume }) {
  const usedFraction = disk.totalBytes > 0 ? 1 - disk.availableBytes / disk.totalBytes : 0
  return (
    <View style={styles.disk}>
      <View style={styles.row}>
        <Text style={styles.value}>{disk.label}</Text>
        <Text style={styles.value}>
          {formatBytes(disk.availableBytes)} free of {formatBytes(disk.totalBytes)}
        </Text>
      </View>
      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            {
              width: `${Math.min(100, Math.max(0, usedFraction * 100))}%`,
              backgroundColor: DISK_LEVEL_COLORS[disk.level]
            }
          ]}
        />
      </View>
      {disk.fullInSeconds !== null ? (
        <Text style={[styles.muted, { color: DISK_LEVEL_COLORS[disk.level] }]}>
          Filling up: full in {formatFullIn(disk.fullInSeconds)} at the current rate
        </Text>
      ) : null}
    </View>
  )
}

export function DiskCard({ disks }: { disks: readonly HostDiskVolume[] }) {
  if (disks.length === 0) {
    return null
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Disk</Text>
      {disks.map((disk) => (
        <DiskRow key={disk.label} disk={disk} />
      ))}
    </View>
  )
}

export const hostSystemStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md
  },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  muted: { color: colors.textSecondary, fontSize: typography.metaSize }
})

const styles = StyleSheet.create({
  ...hostSystemStyles,
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textSecondary, fontSize: typography.bodySize },
  value: { color: colors.textPrimary, fontSize: typography.bodySize },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    padding: spacing.xs,
    gap: spacing.xs
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.button
  },
  segmentSelected: { backgroundColor: colors.surfaceBright },
  segmentText: { color: colors.textSecondary, fontSize: typography.bodySize },
  segmentTextSelected: { color: colors.bgBase, fontWeight: '600' },
  disk: { gap: spacing.sm },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bgRaised, overflow: 'hidden' },
  barFill: { height: 6 }
})
