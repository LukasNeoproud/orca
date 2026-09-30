import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { cancelledJournalPromptBody } from '../native-chat/agent-session-journal/journal-prompt-body-bounds'
import {
  codexApprovalItem,
  codexInteractionItem,
  codexPromptIdentity,
  codexQuestionItems
} from './codex-structured-prompt-items'
import { CODEX_USER_INPUT_METHOD } from './codex-structured-prompt-replies'
import { CODEX_DYNAMIC_TOOL_CALL_METHOD, readOrcaInteractionCall } from './codex-orca-interaction'
import { CODEX_MCP_ELICITATION_METHOD } from '../../shared/orca-interaction-elicitation'
import { readOrcaInteractionElicitation } from './codex-interaction-elicitation'
import type {
  CodexJournalTranslationAdmission,
  CodexJournalTranslatorDeps
} from './codex-structured-journal-contracts'
import { CODEX_JOURNAL_ADMITTED } from './codex-structured-journal-contracts'
import { MAX_CODEX_PENDING_PROMPTS } from './codex-structured-journal-limits'
import {
  admitCodexLifecycleItems,
  appendCodexLifecycleItem,
  publishCodexLifecycle
} from './codex-structured-journal-sink'
import type { CodexPendingJournalPrompt } from './codex-structured-journal-settlement'

export class CodexJournalPrompts {
  readonly pending = new Map<string, CodexPendingJournalPrompt>()

  constructor(
    private readonly deps: Pick<CodexJournalTranslatorDeps, 'sink' | 'bindPromptItemId'>,
    private readonly detailFor: (threadId: string, itemId: string) => string | null
  ) {}

  handle(event: {
    threadId: string
    method: string
    params: unknown
    codexItemId: string
    promptKey: string
  }): CodexJournalTranslationAdmission {
    if (
      event.method === CODEX_DYNAMIC_TOOL_CALL_METHOD ||
      event.method === CODEX_MCP_ELICITATION_METHOD
    ) {
      const interaction =
        event.method === CODEX_DYNAMIC_TOOL_CALL_METHOD
          ? readOrcaInteractionCall(event.params)
          : readOrcaInteractionElicitation(event.params)
      if (!interaction) {
        return { accepted: false, reason: 'untranslated' }
      }
      const identity = codexPromptIdentity({
        threadId: event.threadId,
        promptKey: event.promptKey
      })
      const body = codexInteractionItem(interaction.request)
      const admission = this.admit(event, [{ identity, body }])
      if (!admission.accepted) {
        return admission
      }
      const itemId = agentJournalItemKey(identity)
      this.pending.set(itemId, { identity, body })
      const trimAdmission = this.trim()
      if (!trimAdmission.accepted) {
        return trimAdmission
      }
      this.deps.bindPromptItemId?.(itemId, event.threadId, event.promptKey)
      return CODEX_JOURNAL_ADMITTED
    }
    if (event.method === CODEX_USER_INPUT_METHOD) {
      const questions = codexQuestionItems({
        threadId: event.threadId,
        promptKey: event.promptKey,
        params: event.params
      })
      const promptItems = questions.map(({ identity, body }) => ({ identity, body }))
      const admission = this.admit(event, promptItems)
      if (!admission.accepted) {
        return admission
      }
      for (const question of promptItems) {
        const itemId = agentJournalItemKey(question.identity)
        this.pending.set(itemId, { identity: question.identity, body: question.body })
        const trimAdmission = this.trim()
        if (!trimAdmission.accepted) {
          return trimAdmission
        }
        this.deps.bindPromptItemId?.(itemId, event.threadId, event.promptKey)
      }
      return CODEX_JOURNAL_ADMITTED
    }
    const identity = codexPromptIdentity({
      threadId: event.threadId,
      promptKey: event.promptKey
    })
    const body = codexApprovalItem({
      method: event.method,
      params: event.params,
      detail: this.detailFor(event.threadId, event.codexItemId)
    })
    const admission = this.admit(event, [{ identity, body }])
    if (!admission.accepted) {
      return admission
    }
    const itemId = agentJournalItemKey(identity)
    this.pending.set(itemId, { identity, body })
    const trimAdmission = this.trim()
    if (!trimAdmission.accepted) {
      return trimAdmission
    }
    this.deps.bindPromptItemId?.(itemId, event.threadId, event.promptKey)
    return CODEX_JOURNAL_ADMITTED
  }

  resolve(journalItemId: string): void {
    this.pending.delete(journalItemId)
  }

  cancel(journalItemId: string): CodexJournalTranslationAdmission {
    const prompt = this.pending.get(journalItemId)
    if (!prompt) {
      return CODEX_JOURNAL_ADMITTED
    }
    const cancelled = cancelledJournalPromptBody(prompt.body)
    if (cancelled) {
      const admission = appendCodexLifecycleItem(this.deps.sink, prompt.identity, cancelled)
      if (!admission.accepted) {
        return admission
      }
      const published = publishCodexLifecycle(this.deps.sink)
      if (!published.accepted) {
        return published
      }
    }
    this.pending.delete(journalItemId)
    return CODEX_JOURNAL_ADMITTED
  }

  dispose(): void {
    this.pending.clear()
  }

  private admit(
    event: { method: string; threadId: string; promptKey: string },
    items: readonly CodexPendingJournalPrompt[]
  ): CodexJournalTranslationAdmission {
    return admitCodexLifecycleItems(
      this.deps.sink,
      `prompt:${encodeURIComponent(event.method)}:${encodeURIComponent(
        event.threadId
      )}:${encodeURIComponent(event.promptKey)}`,
      items
    )
  }

  private trim(): CodexJournalTranslationAdmission {
    while (this.pending.size > MAX_CODEX_PENDING_PROMPTS) {
      const oldest = this.pending.keys().next().value
      if (typeof oldest !== 'string') {
        break
      }
      const admission = this.cancel(oldest)
      if (!admission.accepted) {
        return admission
      }
    }
    return CODEX_JOURNAL_ADMITTED
  }
}
