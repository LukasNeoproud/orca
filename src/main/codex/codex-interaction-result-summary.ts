export function summarizeCodexInteractionResult(text: string): string {
  try {
    const result = JSON.parse(text) as { status?: unknown }
    return result.status === 'cancelled'
      ? 'Interaction cancelled'
      : result.status === 'submitted'
        ? 'Response submitted'
        : 'Interaction completed'
  } catch {
    return 'Interaction completed'
  }
}
