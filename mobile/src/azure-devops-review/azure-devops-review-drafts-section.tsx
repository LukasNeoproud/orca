import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Bot, CheckSquare, Square, User } from 'lucide-react-native'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type {
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewDraftView,
  AzureDevOpsReviewPublishResult
} from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'
import { AzureDevOpsReviewComposer } from './azure-devops-review-composer'
import { reviewStyles as styles } from './azure-devops-review-styles'
import { useAzureDevOpsReviewDraftPrompts } from './azure-devops-review-draft-prompts'
import { AzureDevOpsDraftsAiSheet, type SendDraftsToAi } from './AzureDevOpsDraftsAiSheet'

function location(draft: AzureDevOpsReviewDraftView): string {
  if (draft.kind === 'inline' && draft.anchor) {
    const { startLine, endLine } = draft.anchor
    return `${draft.filePath}:${startLine === endLine ? startLine : `${startLine}–${endLine}`}`
  }
  if (draft.kind === 'file') {
    return draft.filePath ?? ''
  }
  return draft.kind === 'reply' ? `Reply to thread #${draft.threadId}` : 'General comment'
}

function DraftCard({
  client,
  draft,
  selected,
  aiEnabled,
  onToggle,
  onChanged
}: {
  client: RpcClient | null
  draft: AzureDevOpsReviewDraftView
  selected: boolean
  aiEnabled: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(false)
  const aiPrompt = useAzureDevOpsReviewDraftPrompts((s) => s.prompts[draft.id] ?? '')
  const setAiPrompt = useAzureDevOpsReviewDraftPrompts((s) => s.setPrompt)
  const [error, setError] = useState<string | null>(null)
  const selectable = !draft.outdated
  const run = async (method: string, params: unknown): Promise<void> => {
    setError(null)
    try {
      await azureDevOpsReviewRequest(client, method, params)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const SelectIcon = selected ? CheckSquare : Square
  return (
    <View style={[styles.card, draft.outdated && styles.cardDashed]}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={onToggle}
          disabled={!selectable}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: !selectable }}
          accessibilityLabel="Select draft for publishing"
        >
          <SelectIcon size={18} color={selectable ? colors.textPrimary : colors.textMuted} />
        </Pressable>
        <Text style={styles.location} numberOfLines={1}>
          {location(draft)}
        </Text>
        {draft.author.kind === 'agent' ? (
          <Bot size={14} color={colors.textSecondary} />
        ) : (
          <User size={14} color={colors.textSecondary} />
        )}
      </View>
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
      {editingPrompt ? (
        <AzureDevOpsReviewComposer
          initialBody={aiPrompt}
          saveLabel="Save prompt"
          placeholder="What should the AI check or change in this draft?"
          onCancel={() => setEditingPrompt(false)}
          onSave={async (text) => {
            setAiPrompt(draft.id, text)
            setEditingPrompt(false)
          }}
        />
      ) : aiPrompt ? (
        <Text style={styles.meta}>AI prompt: {aiPrompt}</Text>
      ) : null}
      {draft.outdated ? (
        <Text style={styles.muted}>
          Outdated: written against an older iteration, the lines may have moved.
        </Text>
      ) : null}
      {draft.state === 'failed' && draft.publishError ? (
        <Text style={styles.error}>{draft.publishError}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!editing ? (
        <View style={styles.actions}>
          {draft.outdated ? (
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={() =>
                void run('azureDevOpsReview.updateDraft', {
                  id: draft.id,
                  patch: { rebaseToLatest: true }
                })
              }
            >
              <Text style={styles.buttonText}>Keep for latest</Text>
            </Pressable>
          ) : null}
          {aiEnabled && !editingPrompt ? (
            <Pressable
              style={styles.button}
              onPress={() => setEditingPrompt(true)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{aiPrompt ? 'Edit AI prompt' : 'AI prompt'}</Text>
            </Pressable>
          ) : null}
          {aiPrompt && !editingPrompt ? (
            <Pressable
              style={styles.button}
              onPress={() => setAiPrompt(draft.id, '')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Remove prompt</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.button}
            onPress={() => setEditing(true)}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            accessibilityRole="button"
            onPress={() => void run('azureDevOpsReview.deleteDraft', { id: draft.id })}
          >
            <Text style={[styles.buttonText, { color: colors.statusRed }]}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

export function AzureDevOpsReviewDraftsSection({
  client,
  detail,
  onChanged,
  onSendToAi
}: {
  client: RpcClient | null
  detail: AzureDevOpsReviewDetail
  onChanged: () => Promise<void>
  /** Absent when the host cannot start review agents for this phone. */
  onSendToAi?: SendDraftsToAi
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [askingAi, setAskingAi] = useState(false)
  const hydratePrompts = useAzureDevOpsReviewDraftPrompts((s) => s.hydrate)
  useEffect(() => {
    void hydratePrompts()
  }, [hydratePrompts])
  const [confirming, setConfirming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const pending = detail.drafts.filter((draft) => draft.state !== 'published')
  const publishedCount = detail.drafts.length - pending.length
  const selectedIds = pending
    .filter((draft) => !draft.outdated && selected.has(draft.id))
    .map((draft) => draft.id)

  const toggle = (id: string): void =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const publish = async (): Promise<void> => {
    setConfirming(false)
    try {
      const { results } = await azureDevOpsReviewRequest<AzureDevOpsReviewPublishResult>(
        client,
        'azureDevOpsReview.publishDrafts',
        { pullRequestKey: detail.pullRequest.key, draftIds: selectedIds }
      )
      const failed = results.filter((result) => !result.ok).length
      setStatus(
        failed ? `${failed} drafts were not published.` : `Published ${results.length} comments.`
      )
      setSelected(new Set())
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      await onChanged()
    }
  }

  if (pending.length === 0) {
    return (
      <Text style={styles.meta}>
        {publishedCount > 0
          ? `All ${publishedCount} drafts are published.`
          : 'No drafts yet. Reply to threads, comment on lines under Files, or start an AI review from the header.'}
      </Text>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.actions}>
        {onSendToAi ? (
          <Pressable
            style={styles.button}
            onPress={() => setAskingAi(true)}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Send to AI</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.button, styles.buttonPrimary, selectedIds.length === 0 && styles.disabled]}
          disabled={selectedIds.length === 0}
          onPress={() => setConfirming(true)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonPrimaryText}>Publish selected ({selectedIds.length})</Text>
        </Pressable>
      </View>
      {status ? <Text style={styles.meta}>{status}</Text> : null}
      {pending.map((draft) => (
        <DraftCard
          key={draft.id}
          client={client}
          draft={draft}
          selected={selected.has(draft.id) && !draft.outdated}
          aiEnabled={onSendToAi !== undefined}
          onToggle={() => toggle(draft.id)}
          onChanged={onChanged}
        />
      ))}
      {onSendToAi && askingAi ? (
        <AzureDevOpsDraftsAiSheet
          detail={detail}
          onClose={() => setAskingAi(false)}
          onSend={onSendToAi}
        />
      ) : null}
      <ConfirmModal
        visible={confirming}
        title={`Publish ${selectedIds.length} comments?`}
        message="The selected drafts are posted to Azure DevOps as you, and reviewers get notified."
        confirmLabel="Publish"
        onConfirm={() => void publish()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  )
}
