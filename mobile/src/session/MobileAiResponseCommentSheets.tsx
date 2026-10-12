import { useEffect, useState } from 'react'
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
import { Pencil, Trash2, X } from 'lucide-react-native'
import type { AiResponseComment } from '../../../src/shared/ai-response-comments'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'

export function MobileAiResponseCommentEditor({
  draft,
  saving = false,
  error,
  onClose,
  onSave
}: {
  draft: Pick<AiResponseComment, 'quote' | 'comment'> | null
  saving?: boolean
  error?: string | null
  onClose: () => void
  onSave: (comment: string) => void
}) {
  const [comment, setComment] = useState(draft?.comment ?? '')
  useEffect(() => setComment(draft?.comment ?? ''), [draft])
  if (!draft) {
    return null
  }
  return (
    <CommentDrawer visible onClose={onClose}>
      <DrawerHeader title={draft.comment ? 'Edit comment' : 'Add comment'} onClose={onClose} />
      <View style={styles.quoteCard}>
        <Text style={styles.quoteLabel}>Quoted response</Text>
        <Text selectable style={styles.quoteText} numberOfLines={8}>
          {draft.quote}
        </Text>
      </View>
      <TextInput
        style={styles.commentInput}
        value={comment}
        onChangeText={setComment}
        placeholder="Add your comment…"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accentBlue}
        multiline
        autoFocus
        editable={!saving}
        accessibilityLabel="Comment"
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label={saving ? 'Adding…' : draft.comment ? 'Save' : 'Add comment'}
        disabled={saving || !comment.trim()}
        onPress={() => onSave(comment.trim())}
      />
    </CommentDrawer>
  )
}

export function MobileAiResponseCommentsSheet({
  visible,
  comments,
  onClose,
  onEdit,
  onDelete
}: {
  visible: boolean
  comments: readonly AiResponseComment[]
  onClose: () => void
  onEdit: (comment: AiResponseComment) => void
  onDelete: (id: string) => void
}) {
  if (!visible) {
    return null
  }
  return (
    <CommentDrawer visible onClose={onClose}>
      <DrawerHeader
        title={`${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`}
        onClose={onClose}
      />
      <View>
        {comments.map((comment) => (
          <View key={comment.id} style={styles.commentRow}>
            <Text style={styles.commentQuote} numberOfLines={3}>
              {comment.quote}
            </Text>
            <Text style={styles.commentBody}>{comment.comment}</Text>
            <View style={styles.rowActions}>
              <Pressable
                style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
                onPress={() => onEdit(comment)}
                accessibilityLabel="Edit comment"
              >
                <Pencil size={15} color={colors.textSecondary} />
                <Text style={styles.rowButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
                onPress={() => onDelete(comment.id)}
                accessibilityLabel="Delete comment"
              >
                <Trash2 size={15} color={colors.statusRed} />
                <Text style={[styles.rowButtonText, styles.deleteText]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </CommentDrawer>
  )
}

function DrawerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <X size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  )
}

function CommentDrawer({
  onClose,
  children
}: {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  // Why Modal, not BottomDrawer: the chat view renders this, and the drawer pulls in reanimated.
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetFrame}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, styles.drawerContent, { paddingBottom: insets.bottom }]}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function PrimaryButton({
  label,
  disabled,
  onPress
}: {
  label: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && styles.pressed
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  drawerContent: { paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.sm },
  title: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  closeButton: { padding: spacing.xs, borderRadius: radii.button },
  quoteCard: {
    backgroundColor: colors.bgPanel,
    borderLeftWidth: 2,
    borderLeftColor: colors.textMuted,
    borderRadius: radii.row,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  quoteLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: spacing.xs
  },
  quoteText: { color: colors.textSecondary, fontSize: typography.metaSize, lineHeight: 18 },
  commentInput: {
    minHeight: 104,
    color: colors.textPrimary,
    backgroundColor: colors.editorSurface,
    borderColor: colors.borderSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.input,
    padding: spacing.md,
    fontSize: TEXT_INPUT_FONT_SIZE,
    textAlignVertical: 'top',
    marginBottom: spacing.md
  },
  errorText: { color: colors.statusRed, fontSize: typography.metaSize, marginBottom: spacing.sm },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright
  },
  primaryButtonDisabled: { opacity: 0.42 },
  primaryButtonText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '700' },
  commentRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingVertical: spacing.md
  },
  commentQuote: { color: colors.textMuted, fontSize: typography.metaSize, lineHeight: 17 },
  commentBody: { color: colors.textPrimary, fontSize: typography.bodySize, marginTop: spacing.sm },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  rowButtonText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  deleteText: { color: colors.statusRed },
  pressed: { opacity: 0.65 },
  sheetFrame: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    backgroundColor: colors.bgBase,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  }
})
