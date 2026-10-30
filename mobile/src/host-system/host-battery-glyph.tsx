import { StyleSheet, Text, View } from 'react-native'
import { Zap } from 'lucide-react-native'
import type { HostBattery } from '../../../src/shared/host-system-types'
import { colors, typography } from '../theme/mobile-theme'

function batteryLevelColor(percent: number): string {
  if (percent <= 10) {
    return colors.statusRed
  }
  return percent <= 20 ? colors.statusAmber : colors.statusGreen
}

/** Battery outline with the charge level as a tinted fill and the percentage drawn inside. */
export function HostBatteryGlyph({ battery }: { battery: HostBattery }) {
  const percent = Math.min(100, Math.max(0, Math.round(battery.percent)))
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Battery ${percent}%${battery.charging ? ', charging' : ''}`}
    >
      {battery.charging ? (
        <Zap size={14} color={colors.statusGreen} fill={colors.statusGreen} />
      ) : null}
      <View style={styles.battery}>
        <View style={styles.body}>
          <View
            style={[
              styles.fill,
              { width: `${percent}%`, backgroundColor: batteryLevelColor(percent) }
            ]}
          />
          <Text style={styles.percent}>{percent}%</Text>
        </View>
        <View style={styles.nub} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  battery: { flexDirection: 'row', alignItems: 'center' },
  body: {
    width: 46,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    borderRadius: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Translucent so the percentage stays readable over any charge level.
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.4 },
  percent: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  nub: {
    width: 3,
    height: 8,
    marginLeft: 1,
    borderTopRightRadius: 1.5,
    borderBottomRightRadius: 1.5,
    backgroundColor: colors.textSecondary
  }
})
