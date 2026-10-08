import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MobileMarkdown } from '../components/MobileMarkdown'
import type { RpcClient } from '../transport/rpc-client'
import type { AzureDevOpsReviewDetail } from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'
import { AzureDevOpsReviewComposer } from './azure-devops-review-composer'
import { reviewStyles as styles } from './azure-devops-review-styles'

export function AzureDevOpsReviewThreadsSection({
  client,
  detail,
  onChanged
}: {
  client: RpcClient | null
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
}) {
  const [replyTo, setReplyTo] = useState<number | null>(null)
  if (detail.threads.length === 0) {
    return <Text style={styles.meta}>No comment threads yet.</Text>
  }
  const threads = [...detail.threads].sort(
    (a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.id - b.id
  )
  return (
    <View style={{ gap: 12 }}>
      {threads.map((thread) => (
        <View key={thread.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.location} numberOfLines={1}>
              {thread.filePath
                ? `${thread.filePath}${thread.anchor ? `:${thread.anchor.startLine}` : ''}`
                : 'General comment'}
            </Text>
            <Text style={styles.muted}>{thread.status}</Text>
          </View>
          {thread.comments
            .filter((comment) => !comment.isSystem)
            .map((comment) => (
              <View key={comment.id} style={{ gap: 2 }}>
                <Text style={styles.meta}>{comment.author.displayName}</Text>
                <MobileMarkdown content={comment.content} />
              </View>
            ))}
          {replyTo === thread.id ? (
            <AzureDevOpsReviewComposer
              saveLabel="Save draft"
              onCancel={() => setReplyTo(null)}
              onSave={async (body) => {
                await azureDevOpsReviewRequest(client, 'azureDevOpsReview.createDraft', {
                  pullRequestKey: detail.pullRequest.key,
                  kind: 'reply',
                  threadId: thread.id,
                  body,
                  author: { kind: 'user' }
                })
                setReplyTo(null)
                await onChanged()
              }}
            />
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={styles.button}
                onPress={() => setReplyTo(thread.id)}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Reply</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}
