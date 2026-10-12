import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { MobileWorktreeLocationState } from './use-mobile-worktree-location'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'
import { colors, radii, spacing } from '../theme/mobile-theme'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'

export function MobileWorktreeLocationFields({
  state,
  repo,
  sourceIsWorkItem
}: {
  state: MobileWorktreeLocationState
  repo: MobileWorkspaceRepo | null
  sourceIsWorkItem: boolean
}) {
  if (repo?.kind === 'folder') {
    return null
  }
  const defaultLocation = repo?.simplifiedWorktreeLocation ?? 'inside'
  const defaultLayout = repo?.simplifiedWorktreeLayout ?? 'nested'
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Worktree location</Text>
      <Text style={styles.detail}>
        Project default: {defaultLocation}, {defaultLayout}
        {repo?.worktreeBasePath ? ` · ${repo.worktreeBasePath}` : ''}
      </Text>
      <View style={styles.row}>
        <Choice
          label="Automatic"
          selected={state.location === 'automatic'}
          onPress={() => state.setLocation('automatic')}
        />
        <Choice
          label="Choose location"
          selected={state.location !== 'automatic'}
          onPress={() => {
            state.setCustomRoot(repo?.worktreeBasePath ?? '')
            state.setLayout(defaultLayout)
            state.setLocation(defaultLocation)
          }}
        />
      </View>
      {state.location !== 'automatic' ? (
        sourceIsWorkItem ? (
          <Text style={styles.error}>
            Choose a branch or a blank workspace to set its location.
          </Text>
        ) : (
          <>
            <View style={styles.row}>
              <Choice
                label="Orca default"
                selected={state.location === 'orca-default'}
                onPress={() => state.setLocation('orca-default')}
              />
              <Choice
                label="Inside project"
                selected={state.location === 'inside'}
                onPress={() => state.setLocation('inside')}
              />
              <Choice
                label="Custom root"
                selected={state.location === 'custom'}
                onPress={() => state.setLocation('custom')}
              />
            </View>
            {state.location === 'custom' ? (
              <TextInput
                style={styles.input}
                value={state.customRoot}
                onChangeText={state.setCustomRoot}
                placeholder="Path on execution host"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                accessibilityLabel="Custom worktree root on execution host"
              />
            ) : null}
            <View style={styles.row}>
              <Choice
                label="Nested"
                selected={state.layout === 'nested'}
                onPress={() => state.setLayout('nested')}
              />
              <Choice
                label="Flat"
                selected={state.layout === 'flat'}
                onPress={() => state.setLayout('flat')}
              />
            </View>
            <Pressable
              style={[
                styles.previewButton,
                (!state.explicitCreation || state.pending) && styles.disabled
              ]}
              disabled={!state.explicitCreation || state.pending}
              onPress={() => void state.previewNow()}
              accessibilityRole="button"
              accessibilityLabel="Preview worktree location"
            >
              <Text style={styles.previewText}>
                {state.pending ? 'Checking…' : 'Preview location'}
              </Text>
            </Pressable>
            {state.preview ? (
              <Text
                style={
                  state.preview.destinationExists || state.preview.occupyingWorktree
                    ? styles.error
                    : styles.detail
                }
              >
                {state.preview.path} · {state.preview.branch.name}
                {state.preview.occupyingWorktree ? ' · Branch already checked out' : ''}
                {state.preview.destinationExists ? ' · Destination already exists' : ''}
                {state.preview.needsLocalIgnore ? ' · Will need a local ignore rule' : ''}
              </Text>
            ) : null}
            {state.preview?.needsLocalIgnore ? (
              <Pressable
                style={styles.previewButton}
                onPress={() => void state.ignoreLocally()}
                accessibilityRole="button"
                accessibilityLabel="Ignore worktree folder locally"
              >
                <Text style={styles.previewText}>Ignore folder locally</Text>
              </Pressable>
            ) : null}
            {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
          </>
        )
      ) : null}
    </View>
  )
}

function Choice({
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
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.md, gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  detail: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.statusRed, fontSize: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    backgroundColor: colors.bgRaised,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  choiceSelected: { borderColor: colors.textSecondary },
  choiceText: { color: colors.textPrimary, fontSize: 12 },
  input: {
    backgroundColor: colors.bgRaised,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: TEXT_INPUT_FONT_SIZE,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  previewButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgRaised,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  previewText: { color: colors.textPrimary, fontSize: 13 },
  disabled: { opacity: 0.45 }
})
