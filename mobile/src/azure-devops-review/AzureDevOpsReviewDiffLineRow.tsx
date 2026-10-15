import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Plus } from 'lucide-react-native'
import { MobileSyntaxSegments } from '../components/MobileSyntaxSegments'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { mobileSessionReaderStyles as diffStyles } from '../session/mobile-session-reader-styles'
import type { MobileHighlightedDiffLine } from '../session/mobile-file-syntax'
import type { MobileDiffLine } from '../session/mobile-diff-lines'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { ReviewInlineItems } from './azure-devops-review-inline-items'
import { reviewStyles } from './azure-devops-review-styles'
import type { RpcClient } from '../transport/rpc-client'
import { AzureDevOpsReviewDiffDraft } from './AzureDevOpsReviewDiffDraft'

/** One diff line, with the threads and drafts anchored on it shown underneath. */
export function AzureDevOpsReviewDiffLineRow({
  client,
  onChanged,
  line,
  items,
  onAddDraft,
  children
}: {
  client: RpcClient | null
  onChanged: () => Promise<void>
  line: MobileHighlightedDiffLine<MobileDiffLine>
  items: ReviewInlineItems | undefined
  /** Absent on deleted lines: drafts anchor to the new version. */
  onAddDraft?: () => void
  /** The open composer for this line. */
  children?: React.ReactNode
}) {
  const lineNumber = line.newLineNumber ?? line.oldLineNumber ?? ''
  return (
    <View style={diffStyles.diffLineBlock}>
      <View
        style={[
          diffStyles.diffLine,
          line.kind === 'add' && diffStyles.diffLineAdded,
          line.kind === 'delete' && diffStyles.diffLineDeleted
        ]}
      >
        <Text style={diffStyles.diffGutter}>{lineNumber}</Text>
        <Text selectable style={diffStyles.diffText}>
          <Text
            style={[
              diffStyles.diffPrefix,
              line.kind === 'add' && diffStyles.diffPrefixAdded,
              line.kind === 'delete' && diffStyles.diffPrefixDeleted
            ]}
          >
            {line.kind === 'add' ? '+ ' : line.kind === 'delete' ? '- ' : '  '}
          </Text>
          <MobileSyntaxSegments segments={line.segments} />
        </Text>
        {onAddDraft ? (
          <Pressable
            style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
            onPress={onAddDraft}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Add draft comment on line ${lineNumber}`}
          >
            <Plus size={12} color={colors.textSecondary} strokeWidth={2.3} />
          </Pressable>
        ) : null}
      </View>
      {items?.threads.map((thread) => (
        <View key={`thread:${thread.id}`} style={[reviewStyles.card, styles.inline]}>
          <Text style={reviewStyles.muted}>Thread · {thread.status}</Text>
          {thread.comments
            .filter((comment) => !comment.isSystem)
            .map((comment) => (
              <View key={comment.id} style={styles.comment}>
                <Text style={reviewStyles.meta}>{comment.author.displayName}</Text>
                <MobileMarkdown content={comment.content} />
              </View>
            ))}
        </View>
      ))}
      {items?.drafts.map((draft) => (
        <View key={`draft:${draft.id}`} style={styles.inline}>
          <AzureDevOpsReviewDiffDraft client={client} draft={draft} onChanged={onChanged} />
        </View>
      ))}
      {children ? <View style={styles.inline}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  add: {
    alignSelf: 'center',
    padding: spacing.xs,
    borderRadius: radii.button
  },
  addPressed: { backgroundColor: colors.bgRaised },
  inline: { marginTop: spacing.xs, marginLeft: spacing.lg },
  comment: { gap: 2 }
})
