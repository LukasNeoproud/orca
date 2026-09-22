import type { AgentJournalRenderItem } from './agent-session-journal-types'
import type { StructuredTaskProposalSource } from './structured-task-proposal'

const REVIEW_PROMPT =
  /(?:^|\s)(?:\/review\b|review\s+(?:the\s+)?(?:changes|diff|implementation|pull request|pr)\b|audit\s+(?:the\s+)?(?:changes|code|implementation)\b)/i

function messageText(item: AgentJournalRenderItem | undefined): string {
  if (item?.body.kind !== 'message') {
    return ''
  }
  return item.body.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export function latestStructuredTaskProposalSource(args: {
  sessionId: string
  workspaceId: string
  epoch: string | null | undefined
  items: readonly AgentJournalRenderItem[] | undefined
}): StructuredTaskProposalSource | null {
  if (!args.epoch) {
    return null
  }
  const items = args.items ?? []
  const userAt = items.findLastIndex(
    (item) => item.body.kind === 'message' && item.body.role === 'user'
  )
  const user = items[userAt]
  const prompt = messageText(user)
  if (!user || !prompt) {
    return null
  }
  const review = REVIEW_PROMPT.test(prompt)
  const assistant = review
    ? items
        .slice(userAt + 1)
        .findLast((item) => item.body.kind === 'message' && item.body.role === 'assistant')
    : undefined
  const reply = messageText(assistant)
  if (review && (!assistant || !reply)) {
    return null
  }
  return {
    sessionId: args.sessionId,
    workspaceId: args.workspaceId,
    kind: review ? 'review' : 'prompt',
    anchor: { epoch: args.epoch, itemId: review ? assistant!.itemId : user.itemId },
    passages: review
      ? [
          { itemId: user.itemId, text: prompt },
          { itemId: assistant!.itemId, text: reply }
        ]
      : [{ itemId: user.itemId, text: prompt }]
  }
}
