import type { ConversationContinuationCandidate } from '../../../../shared/conversation-continuation'
import type { ConversationContinuationView } from '../../../../shared/conversation-continuation-view'

export async function waitForContinuationSelection(args: {
  candidate: ConversationContinuationCandidate
  revision: string
  refresh: () => Promise<ConversationContinuationView>
  assertCurrent: () => void
}): Promise<ConversationContinuationCandidate> {
  let candidate = args.candidate
  const deadline = Date.now() + 10 * 60_000
  while (true) {
    args.assertCurrent()
    const latest = await args.refresh()
    args.assertCurrent()
    if (latest.checkpoint?.revision !== args.revision || candidate.mode === 'fresh') {
      throw new Error('The conversation changed. Choose how to continue again.')
    }
    if (candidate.status !== 'preparing') {
      return candidate
    }
    if (latest.candidate?.candidateId !== candidate.candidateId) {
      throw new Error('The prepared copy changed. Choose how to continue again.')
    }
    candidate = latest.candidate
    if (candidate.mode === 'fresh') {
      throw new Error('The conversation changed. Choose how to continue again.')
    }
    if (candidate.status !== 'preparing') {
      return candidate
    }
    if (Date.now() >= deadline) {
      throw new Error('Preparation is still running. Reopen Continue to check its status.')
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000))
  }
}
