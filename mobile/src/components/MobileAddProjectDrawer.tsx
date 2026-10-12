import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { RpcClient } from '../transport/rpc-client'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'
import { BottomDrawer } from './BottomDrawer'
import {
  useMobileAddProject,
  type MobileAddProjectKind,
  type MobileAddProjectMode
} from './use-mobile-add-project'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'

export type MobileAddProjectDrawerProps = {
  visible: boolean
  client: RpcClient | null
  hostId?: string
  hostName?: string
  onClose: () => void
  onCreated: (repo: MobileWorkspaceRepo) => void | Promise<void>
  onRefresh?: () => void | Promise<void>
}

const MODES: { id: MobileAddProjectMode; label: string }[] = [
  { id: 'existing', label: 'Existing' },
  { id: 'create', label: 'New' },
  { id: 'clone', label: 'Clone' }
]

export function MobileAddProjectDrawer(props: MobileAddProjectDrawerProps) {
  const [mode, setMode] = useState<MobileAddProjectMode>('existing')
  const [kind, setKind] = useState<MobileAddProjectKind>('git')
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [previousVisible, setPreviousVisible] = useState(props.visible)
  const { busy, error, setError, submit } = useMobileAddProject(props)

  if (props.visible !== previousVisible) {
    setPreviousVisible(props.visible)
    if (props.visible) {
      setMode('existing')
      setKind('git')
      setPath('')
      setName('')
      setUrl('')
      setError('')
    }
  }

  function changeMode(next: MobileAddProjectMode): void {
    setMode(next)
    setError('')
  }

  async function handleSubmit(): Promise<void> {
    const created = await submit({ mode, kind, path, name, url })
    if (created) {
      props.onClose()
    }
  }

  const pathLabel = mode === 'existing' ? 'Folder path on host' : 'Parent folder on host'
  const pathPlaceholder = mode === 'existing' ? '/path/to/project' : '/path/to/projects'
  const submitLabel =
    mode === 'existing' ? 'Add project' : mode === 'create' ? 'Create project' : 'Clone project'
  const ready =
    Boolean(path.trim()) &&
    (mode !== 'create' || Boolean(name.trim())) &&
    (mode !== 'clone' || Boolean(url.trim()))

  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose} dragContentToDismiss={!busy}>
      <Text style={styles.title}>Add project</Text>
      <Text style={styles.hostHint}>
        Paths refer to {props.hostName?.trim() || 'the connected host'}.
      </Text>

      <View style={styles.modes} accessibilityRole="tablist">
        {MODES.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === option.id, disabled: busy }}
            disabled={busy}
            style={[styles.mode, mode === option.id && styles.modeSelected]}
            onPress={() => changeMode(option.id)}
          >
            <Text style={[styles.modeText, mode === option.id && styles.modeTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode !== 'clone' ? (
        <View style={styles.kindRow}>
          <Text style={styles.label}>Project type</Text>
          <View style={styles.kindOptions}>
            {(['git', 'folder'] as const).map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: kind === option, disabled: busy }}
                disabled={busy}
                style={[styles.kindOption, kind === option && styles.kindSelected]}
                onPress={() => {
                  setKind(option)
                  setError('')
                }}
              >
                <Text style={kind === option ? styles.kindTextSelected : styles.kindText}>
                  {option === 'git' ? 'Git repository' : 'Folder'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {mode === 'clone' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Git URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            editable={!busy}
            placeholder="https://example.com/project.git"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Git URL"
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{pathLabel}</Text>
        <TextInput
          style={styles.input}
          value={path}
          onChangeText={setPath}
          editable={!busy}
          placeholder={pathPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={pathLabel}
        />
      </View>

      {mode === 'create' ? (
        <View style={styles.field}>
          <Text style={styles.label}>Project name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            editable={!busy}
            placeholder="my-project"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Project name"
          />
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {!props.client ? (
        <Text style={styles.error}>Connect to the host before adding a project.</Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={styles.cancel}
          onPress={props.onClose}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy || !props.client }}
          disabled={!ready || busy || !props.client}
          style={[styles.submit, (!ready || busy || !props.client) && styles.submitDisabled]}
          onPress={() => void handleSubmit()}
        >
          {busy ? <ActivityIndicator size="small" color={colors.bgBase} /> : null}
          <Text style={styles.submitText}>{busy ? 'Working…' : submitLabel}</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  hostHint: { color: colors.textMuted, fontSize: typography.metaSize, marginTop: spacing.xs },
  modes: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderRadius: radii.button,
    padding: spacing.xs,
    marginTop: spacing.lg
  },
  mode: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.button },
  modeSelected: { backgroundColor: colors.bgRaised },
  modeText: { color: colors.textMuted, fontSize: typography.bodySize },
  modeTextSelected: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  kindRow: { marginTop: spacing.lg },
  kindOptions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  kindOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.button
  },
  kindSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textSecondary },
  kindText: { color: colors.textMuted, fontSize: typography.bodySize },
  kindTextSelected: { color: colors.textPrimary, fontSize: typography.bodySize },
  field: { marginTop: spacing.lg },
  label: { color: colors.textSecondary, fontSize: typography.metaSize, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: TEXT_INPUT_FONT_SIZE
  },
  error: { color: colors.statusRed, fontSize: typography.metaSize, marginTop: spacing.md },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  cancel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.button
  },
  cancelText: { color: colors.textSecondary, fontSize: typography.bodySize },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.button
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' }
})
