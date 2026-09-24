import { View, Text, Pressable, Switch } from 'react-native'
import { X } from 'lucide-react-native'
import type { CustomKey } from './CustomKeyModal'
import type { TerminalAccessoryKey } from '../terminal/terminal-accessory-keys'
import { colors } from '../theme/mobile-theme'
import { styles } from './TerminalShortcutSettings.styles'

export type AccessoryItem =
  | { kind: 'built-in'; key: TerminalAccessoryKey }
  | { kind: 'custom'; key: CustomKey }

export function AccessoryRow({
  item,
  visible,
  onToggle,
  onDelete
}: {
  item: AccessoryItem
  visible: boolean
  onToggle: (visible: boolean) => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <View style={styles.reorderRowContent}>
      <View style={styles.keycap}>
        <Text style={styles.keycapText}>{item.key.label}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {item.kind === 'built-in'
            ? (item.key.accessibilityLabel ?? item.key.label)
            : item.key.label}
        </Text>
        {item.kind === 'custom' ? (
          <Text style={styles.rowSublabel} numberOfLines={1} ellipsizeMode="tail">
            {item.key.bytes.replace(/\r/g, ' ↵')}
          </Text>
        ) : null}
      </View>
      {item.kind === 'built-in' ? (
        <Switch
          value={visible}
          onValueChange={onToggle}
          accessibilityLabel={`Show ${item.key.accessibilityLabel ?? item.key.label}`}
          trackColor={{ false: colors.borderSubtle, true: colors.textSecondary }}
          thumbColor={colors.textPrimary}
        />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.key.label}`}
        >
          <X size={16} color={colors.statusRed} />
        </Pressable>
      )}
    </View>
  )
}
