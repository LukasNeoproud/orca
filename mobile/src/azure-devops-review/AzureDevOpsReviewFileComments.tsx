import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MessageSquarePlus } from 'lucide-react-native'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { AzureDevOpsReviewDetail } from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'
import { AzureDevOpsReviewComposer } from './azure-devops-review-composer'
import { AzureDevOpsReviewDiffDraft } from './AzureDevOpsReviewDiffDraft'
import { reviewStyles } from './azure-devops-review-styles'

/** Threads and drafts on a whole file, with a composer for a new file-level draft. */
export function AzureDevOpsReviewFileComments({
  client,
  detail,
  path,
  onChanged
}: {
  client: RpcClient | null
  detail: AzureDevOpsReviewDetail
  path: string
  onChanged: () => Promise<void>
}) {
  const [composing, setComposing] = useState(false)
  const threads = detail.threads.filter((thread) => thread.filePath === path && !thread.anchor)
  const drafts = detail.drafts.filter(
    (draft) => draft.state !== 'published' && draft.kind === 'file' && draft.filePath === path
  )

  return (
    <View style={styles.container}>
      {!composing ? (
        <Pressable
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
          onPress={() => setComposing(true)}
          accessibilityRole="button"
          accessibilityLabel={`Comment on ${path}`}
        >
          <MessageSquarePlus size={14} color={colors.textSecondary} />
          <Text style={reviewStyles.meta}>Comment file</Text>
        </Pressable>
      ) : (
        <AzureDevOpsReviewComposer
          saveLabel="Save draft"
          onCancel={() => setComposing(false)}
          onSave={async (body) => {
            await azureDevOpsReviewRequest(client, 'azureDevOpsReview.createDraft', {
              pullRequestKey: detail.pullRequest.key,
              kind: 'file',
              filePath: path,
              body,
              author: { kind: 'user' }
            })
            setComposing(false)
            await onChanged()
          }}
        />
      )}
      {threads.map((thread) => (
        <View key={`thread:${thread.id}`} style={reviewStyles.card}>
          <Text style={reviewStyles.muted}>File thread · {thread.status}</Text>
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
      {drafts.map((draft) => (
        <AzureDevOpsReviewDiffDraft
          key={draft.id}
          client={client}
          draft={draft}
          onChanged={onChanged}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.button
  },
  addPressed: { backgroundColor: colors.bgRaised },
  comment: { gap: 2 }
})
