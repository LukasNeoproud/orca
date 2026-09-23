import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { MobileCodexSessionUsage } from './mobile-codex-session-usage'
import { usageLabels } from './mobile-codex-usage-labels'

export function MobileCodexUsageStatus({
  usage
}: {
  usage: MobileCodexSessionUsage | null
}): React.JSX.Element | null {
  const resetsAt = usage?.codexWeeklyUsage?.resetsAt
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (!finiteNonNegative(resetsAt) || resetsAt <= Date.now()) {
      return
    }
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(resetsAt - Date.now() + 1, 2_147_483_647)
    )
    return () => clearTimeout(timer)
  }, [resetsAt])
  const labels = useMemo(() => usageLabels(usage, now), [now, usage])
  if (labels.length === 0) {
    return null
  }
  return (
    <View style={styles.row} accessibilityLabel={labels.join(', ')}>
      {labels.map((label) => (
        <Text key={label} style={styles.label}>
          {label}
        </Text>
      ))}
    </View>
  )
}

function finiteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  label: {
    color: colors.textMuted,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    fontFamily: typography.monoFamily,
    fontSize: typography.metaSize
  }
})
