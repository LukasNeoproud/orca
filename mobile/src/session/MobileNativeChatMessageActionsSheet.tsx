import { useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Copy,
  GitBranch,
  ListTree,
  MessageSquareQuote,
  Reply,
  TextSelect,
  X
} from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { ActionSheetContent } from '../components/ActionSheetModal'
import { BottomDrawer } from '../components/BottomDrawer'
import { useClipboardWriter } from '../platform/clipboard'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { nativeChatMessagePlainText } from './mobile-native-chat-message-plain-text'
import { nativeChatCommentableText } from './mobile-native-chat-message-text'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'
import {
  useMobileConversationBranching,
  type MobileConversationBranching
} from './mobile-conversation-branch-context'

type Props = {
  /** The long-pressed message. The owner mounts this only while the sheet is open. */
  message: NativeChatMessage
  onClose: () => void
  /** Quotes a selected range of an agent reply into a response comment. */
  onCommentQuote?: (quote: string) => void
  /** A finished agent reply: a conversation can branch after it or hand it back. */
  branchable?: boolean
}

type BranchAction = 'branch' | 'return' | 'family'

function branchActions(
  branching: MobileConversationBranching | null,
  branchable: boolean,
  request: (action: BranchAction) => void
) {
  if (!branching) {
    return []
  }
  return [
    ...(branchable
      ? [{ label: 'Branch from here', icon: GitBranch, onPress: () => request('branch') }]
      : []),
    ...(branchable && branching.returnFrom
      ? [
          {
            label: 'Return result to the branch point',
            icon: Reply,
            onPress: () => request('return')
          }
        ]
      : []),
    ...(branching.openFamily
      ? [{ label: 'Conversation family', icon: ListTree, onPress: () => request('family') }]
      : [])
  ]
}

export function MobileNativeChatMessageActionsSheet({
  message,
  onClose,
  onCommentQuote,
  branchable = false
}: Props): React.JSX.Element {
  const branching = useMobileConversationBranching()
  // The branch drawers are modals too, so they open once this drawer has unmounted.
  const branchRequested = useRef<BranchAction | null>(null)
  const clipboard = useClipboardWriter()
  const [sheetVisible, setSheetVisible] = useState(true)
  const [selecting, setSelecting] = useState(false)
  // Wait for the drawer to unmount before presenting another native modal.
  const selectRequested = useRef(false)
  const commentRequested = useRef(false)
  const [commenting, setCommenting] = useState(false)
  const [commentText] = useState(() => nativeChatCommentableText(message.blocks))
  // Streaming updates must not reset an active native text selection.
  const [text] = useState(() => nativeChatMessagePlainText(message))
  const closeSheet = () => setSheetVisible(false)

  return (
    <>
      <BottomDrawer
        visible={sheetVisible}
        onClose={closeSheet}
        onAfterClose={() => {
          if (selectRequested.current) {
            setSelecting(true)
          } else if (commentRequested.current) {
            setCommenting(true)
          } else {
            onClose()
            runBranchAction(branching, branchRequested.current, message)
          }
        }}
        dragContentToDismiss
      >
        <ActionSheetContent
          onClose={closeSheet}
          actions={[
            {
              label: 'Copy message',
              icon: Copy,
              disabled: text.length === 0,
              onPress: () => {
                void clipboard.writeText(text).catch((error: unknown) => {
                  Alert.alert(
                    'Copy failed',
                    error instanceof Error ? error.message : 'The clipboard rejected the text.'
                  )
                })
              }
            },
            {
              label: 'Select text',
              icon: TextSelect,
              disabled: text.length === 0,
              onPress: () => {
                selectRequested.current = true
              }
            },
            ...(onCommentQuote && commentText
              ? [
                  {
                    label: 'Comment on response',
                    icon: MessageSquareQuote,
                    onPress: () => {
                      commentRequested.current = true
                    }
                  }
                ]
              : []),
            ...branchActions(branching, branchable, (action) => {
              branchRequested.current = action
            })
          ]}
        />
      </BottomDrawer>
      {selecting ? <SelectTextScreen text={text} onClose={onClose} /> : null}
      {commenting && onCommentQuote ? (
        <CommentQuoteScreen
          text={commentText}
          onClose={onClose}
          onComment={(quote) => {
            onClose()
            onCommentQuote(quote)
          }}
        />
      ) : null}
    </>
  )
}

function runBranchAction(
  branching: MobileConversationBranching | null,
  action: BranchAction | null,
  message: NativeChatMessage
): void {
  if (action === 'branch') {
    branching?.branchFrom(message)
  } else if (action === 'return') {
    branching?.returnFrom?.(message)
  } else if (action === 'family') {
    branching?.openFamily?.()
  }
}

function SelectTextScreen({
  text,
  onClose
}: {
  text: string
  onClose: () => void
}): React.JSX.Element {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select text</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={styles.close}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text selectable style={styles.text}>
            {text}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  )
}

function CommentQuoteScreen({
  text,
  onClose,
  onComment
}: {
  text: string
  onClose: () => void
  onComment: (quote: string) => void
}): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const [selection, setSelection] = useState({ start: 0, end: text.length })
  const quote = text.slice(selection.start, selection.end)
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select text to comment on</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Cancel comment selection"
            accessibilityRole="button"
            style={styles.close}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <TextInput
            style={styles.text}
            value={text}
            multiline
            contextMenuHidden
            showSoftInputOnFocus={false}
            autoFocus
            selection={selection}
            onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
            onChangeText={() => undefined}
            selectionColor={colors.accentBlue}
            accessibilityLabel="Selected response quote"
          />
        </ScrollView>
        <Pressable
          style={({ pressed }) => [styles.commentButton, pressed && styles.commentButtonPressed]}
          disabled={!quote.trim()}
          onPress={() => onComment(quote)}
          accessibilityRole="button"
          accessibilityLabel="Comment on selected text"
        >
          <MessageSquareQuote size={16} color={colors.bgBase} />
          <Text style={styles.commentButtonText}>Comment</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  close: { padding: spacing.xs },
  body: { padding: spacing.lg },
  text: { color: colors.textPrimary, fontSize: TEXT_INPUT_FONT_SIZE, lineHeight: 22 },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    margin: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.textPrimary
  },
  commentButtonPressed: { opacity: 0.8 },
  commentButtonText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' }
})
