import { Pressable, Text, TextInput, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { colors } from '../theme/mobile-theme'
import { newWorktreeFormStyles as styles } from './new-worktree-form-styles'

export function NewWorkspaceExtraFields(props: {
  displayLabel: string
  onDisplayLabelChange: (value: string) => void
  baseRef: string
  baseRefPlaceholder: string
  onBaseRefChange: (value: string) => void
  parentName: string
  onOpenParent: () => void
  sparseName: string
  sparseAvailable: boolean
  sparseLoading: boolean
  sparseError: string
  onOpenSparse: () => void
}) {
  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>Display label</Text>
        <TextInput
          style={styles.input}
          value={props.displayLabel}
          onChangeText={props.onDisplayLabelChange}
          placeholder="Use workspace name"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Base ref</Text>
        <TextInput
          style={styles.input}
          value={props.baseRef}
          onChangeText={props.onBaseRefChange}
          placeholder={props.baseRefPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Parent worktree</Text>
        <Pressable style={styles.fieldButton} onPress={props.onOpenParent}>
          <Text style={styles.fieldButtonText} numberOfLines={1}>
            {props.parentName}
          </Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Sparse checkout</Text>
        <Pressable
          style={[styles.fieldButton, !props.sparseAvailable && styles.disabled]}
          disabled={!props.sparseAvailable}
          onPress={props.onOpenSparse}
        >
          <Text style={styles.fieldButtonText} numberOfLines={1}>
            {props.sparseAvailable
              ? props.sparseLoading
                ? 'Loading presets…'
                : props.sparseName
              : 'Only available for local Git projects'}
          </Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
        {props.sparseError ? <Text style={styles.errorInline}>{props.sparseError}</Text> : null}
      </View>
    </>
  )
}
