import { useState, type ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GitBranch, X } from 'lucide-react-native'
import {
  CONVERSATION_BRANCH_FOCUS_MAX,
  CONVERSATION_BRANCH_LABEL_MAX,
  type ConversationBranchMode
} from '../../../src/shared/conversation-branch'
import {
  defaultCleanBranchPrompt,
  defaultConversationBranchLabel
} from '../../../src/shared/conversation-branch-defaults'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export type MobileBranchDrawerValues = {
  label: string
  mode: ConversationBranchMode
  focus: string
  prompt: string
}

const MODES: { mode: ConversationBranchMode; label: string; detail: string }[] = [
  { mode: 'full', label: 'Whole', detail: 'Keeps the conversation up to this reply.' },
  {
    mode: 'compact',
    label: 'Summarized',
    detail: 'Claude summarizes the conversation first, which can take a minute.'
  },
  { mode: 'clean', label: 'New', detail: 'No history; the prompt quotes this reply.' }
]

/** Names a branch, picks how much it keeps, and drafts its first prompt. Nothing is sent. */
export function MobileBranchDrawer({
  replyText,
  pending,
  error,
  onClose,
  onCreate
}: {
  replyText: string
  pending: boolean
  error: string | null
  onClose: () => void
  onCreate: (values: MobileBranchDrawerValues) => void
}): React.JSX.Element {
  const [label, setLabel] = useState(() => defaultConversationBranchLabel(replyText))
  const [mode, setMode] = useState<ConversationBranchMode>('full')
  const [focus, setFocus] = useState('')
  const [prompt, setPrompt] = useState('')
  const choose = (next: ConversationBranchMode): void => {
    setMode(next)
    if (next === 'clean' && !prompt.trim()) {
      setPrompt(defaultCleanBranchPrompt(replyText))
    }
  }
  return (
    <DrawerFrame title="Branch from this reply" onClose={onClose}>
      <Text style={styles.hint}>
        The branch opens as a new chat with its prompt unsent. Branches share this workspace.
      </Text>
      <FieldLabel>Name</FieldLabel>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        maxLength={CONVERSATION_BRANCH_LABEL_MAX}
        editable={!pending}
        selectionColor={colors.accentBlue}
        accessibilityLabel="Name"
      />
      <FieldLabel>Context</FieldLabel>
      <View style={styles.modes} accessibilityRole="radiogroup">
        {MODES.map((option) => (
          <Pressable
            key={option.mode}
            style={[styles.mode, mode === option.mode && styles.modeChosen]}
            disabled={pending}
            onPress={() => choose(option.mode)}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === option.mode }}
          >
            <Text style={[styles.modeText, mode === option.mode && styles.modeTextChosen]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{MODES.find((option) => option.mode === mode)?.detail}</Text>
      {mode === 'compact' ? (
        <>
          <FieldLabel>Summarize with a focus on</FieldLabel>
          <TextInput
            style={styles.input}
            value={focus}
            onChangeText={setFocus}
            placeholder={label}
            placeholderTextColor={colors.textMuted}
            maxLength={CONVERSATION_BRANCH_FOCUS_MAX}
            editable={!pending}
            accessibilityLabel="Summary focus"
          />
        </>
      ) : null}
      <FieldLabel>Prompt</FieldLabel>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Optional. It waits in the branch's composer."
        placeholderTextColor={colors.textMuted}
        multiline
        editable={!pending}
        accessibilityLabel="Prompt"
      />
      <ErrorText error={error} />
      <PrimaryButton
        label={pending ? (mode === 'compact' ? 'Summarizing…' : 'Creating…') : 'Create branch'}
        disabled={pending || !label.trim()}
        onPress={() =>
          onCreate({ label: label.trim(), mode, focus: focus.trim() || label.trim(), prompt })
        }
      />
    </DrawerFrame>
  )
}

/** The branch's result, editable, before it goes to where the branch started. */
export function MobileBranchReturnDrawer({
  initialContent,
  parentName,
  pending,
  error,
  onClose,
  onReturn
}: {
  initialContent: string
  parentName: string
  pending: boolean
  error: string | null
  onClose: () => void
  onReturn: (content: string) => void
}): React.JSX.Element {
  const [content, setContent] = useState(initialContent)
  return (
    <DrawerFrame title="Return result to the branch point" onClose={onClose}>
      <Text style={styles.hint}>
        {`The result goes to ${parentName} as a draft. Nothing is sent.`}
      </Text>
      <TextInput
        style={[styles.input, styles.multiline, styles.result]}
        value={content}
        onChangeText={setContent}
        multiline
        editable={!pending}
        accessibilityLabel="Result"
      />
      <ErrorText error={error} />
      <PrimaryButton
        label={pending ? 'Returning…' : 'Return to the branch point'}
        disabled={pending || !content.trim()}
        onPress={() => onReturn(content)}
      />
    </DrawerFrame>
  )
}

export function DrawerFrame({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  const insets = useSafeAreaInsets()
  // Why Modal, not BottomDrawer: the chat view renders this, and the drawer pulls in reanimated.
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.frame}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.header}>
            <GitBranch size={16} color={colors.textSecondary} />
            <Text style={styles.title}>{title}</Text>
            <Pressable
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function FieldLabel({ children }: { children: string }): React.JSX.Element {
  return <Text style={styles.fieldLabel}>{children}</Text>
}

export function ErrorText({ error }: { error: string | null }): React.JSX.Element | null {
  return error ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {error}
    </Text>
  ) : null
}

function PrimaryButton({
  label,
  disabled,
  onPress
}: {
  label: string
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && styles.pressed
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    backgroundColor: colors.bgBase,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '90%'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  title: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  close: { padding: spacing.xs, borderRadius: radii.button },
  hint: { color: colors.textMuted, fontSize: typography.metaSize, marginBottom: spacing.sm },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    marginBottom: spacing.xs
  },
  input: {
    color: colors.textPrimary,
    backgroundColor: colors.editorSurface,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: TEXT_INPUT_FONT_SIZE,
    marginBottom: spacing.md
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  result: { minHeight: 160, maxHeight: 320 },
  modes: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  mode: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  modeChosen: { backgroundColor: colors.surfaceBright, borderColor: colors.surfaceBright },
  modeText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  modeTextChosen: { color: colors.bgBase },
  error: { color: colors.statusRed, fontSize: typography.metaSize, marginBottom: spacing.sm },
  primary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright
  },
  primaryDisabled: { opacity: 0.42 },
  primaryText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '700' },
  pressed: { opacity: 0.65 }
})
