import { memo, useEffect, useRef, useState } from 'react'
import { type GestureResponderEvent, Image, Pressable, Text, TextInput, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { ArrowUp, Copy, GitBranch, MessageSquareQuote, X } from 'lucide-react-native'
import { splitNativeChatBlocks } from '../../../src/shared/native-chat-tool-fold'
import { selectActiveToolCall } from '../../../src/shared/native-chat-tool-activity'
import { isImageRefBlock, isTextBlock } from '../../../src/shared/native-chat-types'
import type { NativeChatBlock, NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { MobileNativeChatTurnStatus } from './MobileNativeChatTurnStatus'
import { ToolRun } from './MobileNativeChatToolRun'
import type { NativeChatTurnStatus } from './use-mobile-native-chat-turn-status'
import { colors } from '../theme/mobile-theme'
import { isRenderableImageUri } from './mobile-native-chat-image-preview'
import { styles, TEXT_SIZE } from './mobile-native-chat-message-styles'
import { nativeChatCommentableText, nativeChatMessageText } from './mobile-native-chat-message-text'
import { MobileNativeChatGenerationStats } from './MobileNativeChatGenerationStats'

function Prose({
  block,
  invert,
  fontScale,
  onOpenFile,
  selectable = true
}: {
  block: NativeChatBlock
  invert?: boolean
  fontScale: number
  onOpenFile?: (relativePath: string) => void
  selectable?: boolean
}): React.JSX.Element | null {
  if (isTextBlock(block)) {
    // Inverted (user) bubbles use a fixed dark-on-light text rather than the
    // markdown renderer's light-on-dark palette.
    if (invert) {
      return (
        <Text selectable style={[styles.userText, { fontSize: TEXT_SIZE * fontScale }]}>
          {block.text}
        </Text>
      )
    }
    return (
      <MobileMarkdown
        content={block.text}
        textScale={1.25 * fontScale}
        selectable={selectable}
        onOpenFile={onOpenFile}
      />
    )
  }
  if (isImageRefBlock(block)) {
    // A local preview (composer echo) or real URL renders as a thumbnail; a bare
    // host path (not loadable on the device) falls back to a text placeholder.
    const uri = block.url ?? block.path
    if (isRenderableImageUri(uri)) {
      return (
        <Image
          source={{ uri }}
          style={styles.imageThumb}
          resizeMode="contain"
          accessibilityLabel={block.alt ?? 'Attached image'}
        />
      )
    }
    return (
      <Text style={[styles.imageRef, { fontSize: TEXT_SIZE * fontScale }]}>
        🖼 {block.alt ?? block.path ?? block.url ?? 'image'}
      </Text>
    )
  }
  return null
}

/** Subtle top-right controls for an agent message: copy its prose, or scroll so
 *  this message's top aligns to the top of the viewport. */
function AgentControls({
  onCopy,
  onScrollToTop,
  onBranch
}: {
  onCopy: () => void
  onScrollToTop?: () => void
  onBranch?: () => void
}): React.JSX.Element {
  return (
    <View style={styles.controls}>
      <Pressable
        style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
        onPress={onCopy}
        hitSlop={8}
        accessibilityLabel="Copy message"
      >
        <Copy size={14} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
      {onBranch ? (
        <Pressable
          style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
          onPress={onBranch}
          hitSlop={8}
          accessibilityLabel="Create related conversation"
        >
          <GitBranch size={14} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
      {onScrollToTop ? (
        <Pressable
          style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
          onPress={onScrollToTop}
          hitSlop={8}
          accessibilityLabel="Scroll this message to top"
        >
          <ArrowUp size={14} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  )
}

function MobileNativeChatMessageImpl({
  message,
  toolsExpanded = false,
  fontScale = 1,
  messageIndex,
  onScrollToMessage,
  onOpenFile,
  turnStatus,
  turnExpanded,
  turnKey,
  onToggleTurn,
  activeTurnIsWorking,
  structuredActivityUi = false,
  onBranchMessage,
  onCommentQuote
}: {
  message: NativeChatMessage
  toolsExpanded?: boolean
  /** Multiplies all chat text sizes for pinch-to-zoom (1 = no change). */
  fontScale?: number
  /** This message's index in the list, paired with onScrollToMessage. */
  messageIndex?: number
  /** Ask the list to align this message's top to the top of the viewport. */
  onScrollToMessage?: (index: number) => void
  onOpenFile?: (relativePath: string) => void
  /** This turn's status row, rendered under a user message (desktop parity). */
  turnStatus?: NativeChatTurnStatus | null
  /** Whether the turn caret has disclosed this turn's activity. */
  turnExpanded?: boolean
  /** Set only when this row's turn has settled and can disclose its activity. */
  turnKey?: string
  /** Stable across renders; the row supplies its own key when tapped. */
  onToggleTurn?: (turnKey: string) => void
  /** Session-level working state for this message's turn; gates the live tool row. */
  activeTurnIsWorking?: boolean
  /** Structured lane only: live tool progress plus the turn-status disclosure. */
  structuredActivityUi?: boolean
  /** Present only for a completed structured response with an exact journal boundary. */
  onBranchMessage?: (message: NativeChatMessage) => void
  /** Long-press response selection snapshots the exact selected range here. */
  onCommentQuote?: (quote: string) => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isAgent = !isUser
  // Briefly tint the bubble to confirm a copy landed.
  const [copied, setCopied] = useState(false)
  const responseText = nativeChatCommentableText(message.blocks)
  const canComment =
    (message.role === 'assistant' || message.role === 'reasoning' || message.role === 'tool') &&
    message.id !== 'streaming' &&
    Boolean(responseText)
  const [selectingQuote, setSelectingQuote] = useState(false)
  const [quoteSelection, setQuoteSelection] = useState({ start: 0, end: responseText.length })
  const quoteInputRef = useRef<TextInput>(null)
  const quoteLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quoteTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current)
      }
      if (quoteLongPressTimerRef.current) {
        clearTimeout(quoteLongPressTimerRef.current)
      }
    },
    []
  )
  useEffect(() => {
    if (!selectingQuote) {
      return
    }
    setQuoteSelection({ start: 0, end: responseText.length })
    const timer = setTimeout(() => quoteInputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [responseText, selectingQuote])
  // Separate the agent's words from its tool activity: prose renders first, the
  // tool calls fold into a collapsible run beneath. The user's own messages get
  // an inverted (filled accent) bubble so they stand apart from agent prose.
  const { prose, tools } = splitNativeChatBlocks(message.blocks)
  const activeCall = structuredActivityUi
    ? selectActiveToolCall(tools, { activeTurnIsWorking })
    : null
  // A completed turn's activity belongs behind the turn-status caret. Leaving the
  // grouped row visible made a failed child command read as a failed response.
  // The composer's global Tools toggle still overrides this, or it would silently
  // do nothing on every settled turn.
  const settledToolsHidden =
    structuredActivityUi &&
    activeCall == null &&
    activeTurnIsWorking === false &&
    !turnExpanded &&
    !toolsExpanded
  const showToolRun = tools.length > 0 && !settledToolsHidden

  const cancelQuoteLongPress = (): void => {
    if (quoteLongPressTimerRef.current) {
      clearTimeout(quoteLongPressTimerRef.current)
      quoteLongPressTimerRef.current = null
    }
    quoteTouchStartRef.current = null
  }

  const handleQuoteTouchStart = (event: GestureResponderEvent): void => {
    if (!canComment || !onCommentQuote || selectingQuote) {
      return
    }
    quoteTouchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY
    }
    quoteLongPressTimerRef.current = setTimeout(() => {
      quoteLongPressTimerRef.current = null
      quoteTouchStartRef.current = null
      setSelectingQuote(true)
    }, 450)
  }

  const handleQuoteTouchMove = (event: GestureResponderEvent): void => {
    const start = quoteTouchStartRef.current
    if (
      start &&
      (Math.abs(event.nativeEvent.pageX - start.x) > 10 ||
        Math.abs(event.nativeEvent.pageY - start.y) > 10)
    ) {
      cancelQuoteLongPress()
    }
  }

  const handleCopy = (): void => {
    const text = nativeChatMessageText(message.blocks)
    if (!text) {
      return
    }
    void Clipboard.setStringAsync(text)
    setCopied(true)
    if (copyTimer.current) {
      clearTimeout(copyTimer.current)
    }
    copyTimer.current = setTimeout(() => setCopied(false), 700)
  }

  // Copy + scroll-to-top, shown inline with the first tool call (or after the
  // prose when there are no tools).
  const controls = isAgent ? (
    <AgentControls
      onCopy={handleCopy}
      onBranch={onBranchMessage ? () => onBranchMessage(message) : undefined}
      onScrollToTop={
        onScrollToMessage && messageIndex !== undefined
          ? () => onScrollToMessage(messageIndex)
          : undefined
      }
    />
  ) : null

  return (
    <>
      <View style={[styles.row, isUser && styles.rowUser]}>
        <View
          style={[
            styles.content,
            isUser && styles.userBubble,
            isReasoning && styles.reasoning,
            copied && styles.copied
          ]}
          onTouchStart={handleQuoteTouchStart}
          onTouchMove={handleQuoteTouchMove}
          onTouchEnd={cancelQuoteLongPress}
          onTouchCancel={cancelQuoteLongPress}
        >
          {selectingQuote ? (
            <View style={styles.quoteSelectionWrap}>
              <TextInput
                ref={quoteInputRef}
                style={[styles.quoteSelectionText, { fontSize: TEXT_SIZE * fontScale }]}
                value={responseText}
                multiline
                contextMenuHidden
                showSoftInputOnFocus={false}
                selectTextOnFocus
                selection={quoteSelection}
                onSelectionChange={(event) => setQuoteSelection(event.nativeEvent.selection)}
                onChangeText={() => undefined}
                selectionColor={colors.accentBlue}
                accessibilityLabel="Selected response quote"
              />
              <View style={styles.quoteSelectionActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.quoteSelectionButton,
                    pressed && styles.controlPressed
                  ]}
                  onPress={() => setSelectingQuote(false)}
                  accessibilityLabel="Cancel comment selection"
                >
                  <X size={14} color={colors.textSecondary} />
                  <Text style={styles.quoteSelectionButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.quoteSelectionButton,
                    styles.quoteCommentButton,
                    pressed && styles.controlPressed
                  ]}
                  onPress={() => {
                    const quote = responseText.slice(quoteSelection.start, quoteSelection.end)
                    if (!quote.trim()) {
                      return
                    }
                    setSelectingQuote(false)
                    onCommentQuote?.(quote)
                  }}
                  accessibilityLabel="Comment on selected text"
                >
                  <MessageSquareQuote size={14} color={colors.bgBase} />
                  <Text style={styles.quoteCommentButtonText}>Comment</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            prose.map((block, index) => (
              <Prose
                key={index}
                block={block}
                invert={isUser}
                fontScale={fontScale}
                onOpenFile={onOpenFile}
                selectable={!canComment}
              />
            ))
          )}
          {!selectingQuote && showToolRun ? (
            <ToolRun
              // Why: a global toggle intentionally resets all per-run/per-line
              // overrides in one remount, avoiding an effect-driven second render.
              key={`${toolsExpanded ? 'expanded' : 'collapsed'}:${turnExpanded ? 'turn' : 'flat'}`}
              blocks={tools}
              defaultExpanded={turnExpanded || toolsExpanded}
              expandChildren={turnExpanded ? false : toolsExpanded}
              activeCall={activeCall}
              trailing={controls}
              onOpenFile={onOpenFile}
            />
          ) : !selectingQuote && controls ? (
            <View style={styles.controlsRow}>{controls}</View>
          ) : null}
          {!selectingQuote && message.role === 'assistant' ? (
            <MobileNativeChatGenerationStats generation={message.generation} />
          ) : null}
        </View>
      </View>
      {turnStatus ? (
        <MobileNativeChatTurnStatus
          startedAt={turnStatus.startedAt}
          thinking={turnStatus.thinking}
          workedSeconds={turnStatus.workedSeconds}
          expanded={turnExpanded ?? false}
          onToggleExpanded={turnKey && onToggleTurn ? () => onToggleTurn(turnKey) : undefined}
        />
      ) : null}
    </>
  )
}

export const MobileNativeChatMessage = memo(MobileNativeChatMessageImpl)
