import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { AzureDevOpsReviewDraftView } from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'
import { AzureDevOpsReviewComposer } from './azure-devops-review-composer'
import { reviewStyles } from './azure-devops-review-styles'

/** An unpublished draft shown in the diff, editable and deletable where it sits. */
export function AzureDevOpsReviewDiffDraft({
  client,
  draft,
  onChanged
}: {
  client: RpcClient | null
  draft: AzureDevOpsReviewDraftView
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async (): Promise<void> => {
    setDeleting(true)
    setError(null)
    try {
      await azureDevOpsReviewRequest(client, 'azureDevOpsReview.deleteDraft', { id: draft.id })
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  return (
    <View style={[reviewStyles.card, reviewStyles.cardDashed]}>
      <Text style={reviewStyles.muted}>
        Draft{draft.author.kind === 'agent' ? ' · AI' : ''}
        {draft.outdated ? ' · outdated' : ''}
      </Text>
      {editing ? (
        <AzureDevOpsReviewComposer
          initialBody={draft.body}
          saveLabel="Save"
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            await azureDevOpsReviewRequest(client, 'azureDevOpsReview.updateDraft', {
              id: draft.id,
              patch: { body }
            })
            setEditing(false)
            await onChanged()
          }}
        />
      ) : (
        <MobileMarkdown content={draft.body} />
      )}
      {error ? <Text style={reviewStyles.error}>{error}</Text> : null}
      {!editing ? (
        <View style={reviewStyles.actions}>
          <Pressable
            style={reviewStyles.button}
            onPress={() => setEditing(true)}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Edit draft"
          >
            <Text style={reviewStyles.buttonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[reviewStyles.button, deleting && reviewStyles.disabled]}
            onPress={() => void remove()}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete draft"
          >
            <Text style={[reviewStyles.buttonText, { color: colors.statusRed }]}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}
