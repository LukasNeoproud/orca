import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CheckSquare, Square } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, spacing } from '../theme/mobile-theme'
import type { AzureDevOpsReviewDetail } from '../../../src/shared/azure-devops-review-types'
import { useAzureDevOpsReviewDraftPrompts } from './azure-devops-review-draft-prompts'
import { reviewStyles } from './azure-devops-review-styles'

export type SendDraftsToAi = (
  items: { draftId: string; instruction: string }[],
  generalInstruction: string
) => Promise<boolean>

function draftLabel(draft: AzureDevOpsReviewDetail['drafts'][number]): string {
  if (draft.kind === 'inline' && draft.anchor) {
    return `${draft.filePath}:${draft.anchor.startLine}`
  }
  if (draft.kind === 'reply') {
    return `Reply to thread #${draft.threadId}`
  }
  return draft.filePath ?? 'General comment'
}

/**
 * Picks drafts and an overall instruction, then hands them with their prompts to a new agent.
 * Mounted only while open, so each opening starts from the current prompts.
 */
export function AzureDevOpsDraftsAiSheet({
  detail,
  onClose,
  onSend
}: {
  detail: AzureDevOpsReviewDetail
  onClose: () => void
  onSend: SendDraftsToAi
}) {
  const prompts = useAzureDevOpsReviewDraftPrompts((s) => s.prompts)
  const clearPrompts = useAzureDevOpsReviewDraftPrompts((s) => s.clearPrompts)
  const pending = detail.drafts.filter((draft) => draft.state !== 'published')
  // Drafts with a prompt are the obvious picks; with none, every draft is.
  const [included, setIncluded] = useState<Set<string>>(() => {
    const prompted = pending.filter((draft) => prompts[draft.id]).map((draft) => draft.id)
    return new Set(prompted.length > 0 ? prompted : pending.map((draft) => draft.id))
  })
  const [general, setGeneral] = useState('')
  const [sending, setSending] = useState(false)

  const chosen = pending.filter((draft) => included.has(draft.id))
  const hasInstruction =
    general.trim().length > 0 || chosen.some((draft) => prompts[draft.id]?.trim())
  const toggle = (id: string): void =>
    setIncluded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const send = async (): Promise<void> => {
    setSending(true)
    try {
      const sent = await onSend(
        chosen.map((draft) => ({ draftId: draft.id, instruction: prompts[draft.id] ?? '' })),
        general
      )
      if (sent) {
        clearPrompts(chosen.map((draft) => draft.id))
        onClose()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomDrawer visible onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Send drafts to AI</Text>
        <Text style={reviewStyles.meta}>
          The pull request's AI chat checks or rewrites the chosen drafts; without one, a new agent
          starts in the review workspace.
        </Text>
        {pending.map((draft) => {
          const Icon = included.has(draft.id) ? CheckSquare : Square
          return (
            <Pressable
              key={draft.id}
              style={styles.row}
              onPress={() => toggle(draft.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: included.has(draft.id) }}
            >
              <Icon size={18} color={colors.textPrimary} />
              <View style={styles.rowText}>
                <Text style={reviewStyles.location} numberOfLines={1}>
                  {draftLabel(draft)}
                </Text>
                <Text style={reviewStyles.muted} numberOfLines={2}>
                  {prompts[draft.id] ? `AI: ${prompts[draft.id]}` : draft.body}
                </Text>
              </View>
            </Pressable>
          )
        })}
        <TextInput
          multiline
          value={general}
          onChangeText={setGeneral}
          placeholder="Instruction for all chosen drafts (optional)"
          placeholderTextColor={colors.textMuted}
          style={reviewStyles.input}
          accessibilityLabel="Instruction for all chosen drafts"
        />
        <View style={reviewStyles.actions}>
          <Pressable style={reviewStyles.button} onPress={onClose} accessibilityRole="button">
            <Text style={reviewStyles.buttonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              reviewStyles.button,
              reviewStyles.buttonPrimary,
              (chosen.length === 0 || !hasInstruction || sending) && reviewStyles.disabled
            ]}
            disabled={chosen.length === 0 || !hasInstruction || sending}
            onPress={() => void send()}
            accessibilityRole="button"
          >
            <Text style={reviewStyles.buttonPrimaryText}>Send ({chosen.length})</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  rowText: { flex: 1, gap: 2 }
})
