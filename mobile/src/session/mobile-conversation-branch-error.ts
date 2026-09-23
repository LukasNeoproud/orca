export function mobileConversationBranchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('source_busy')) {
    return 'Wait for the response to finish before branching.'
  }
  if (message.includes('source_stale')) {
    return 'The source changed. Reload the conversation and retry.'
  }
  if (message.includes('invalid_anchor')) {
    return 'This response does not have an exact branch point.'
  }
  return message || 'The related conversation request failed.'
}
