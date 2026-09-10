import type { StructuredAgentSessionAdapter } from './structured-agent-session-adapter'

export async function readNativeSessionOptions(input: {
  adapter: Pick<StructuredAgentSessionAdapter, 'readOptions' | 'readOptionRestoreFailures'>
  sessionId: string
  fence: number
  priorOptions?: Readonly<Record<string, string>>
}): Promise<Readonly<Record<string, string>> | undefined> {
  const { adapter, sessionId, fence, priorOptions } = input
  const reported = await adapter.readOptions?.({ sessionId, fence })
  if (!reported) {
    return undefined
  }
  const skipped = new Set(input.adapter.readOptionRestoreFailures?.(sessionId) ?? [])
  const restored = priorOptions ? { ...priorOptions } : {}
  delete restored.model
  delete restored.effort
  for (const key of skipped) {
    delete restored[key]
  }
  for (const option of reported.options ?? []) {
    if (
      option.currentValue !== undefined &&
      option.choices.some((choice) => choice.value === option.currentValue) &&
      !skipped.has(option.id)
    ) {
      restored[option.id] = option.currentValue
    }
  }
  return {
    ...restored,
    model: reported.current.model,
    ...(reported.current.effort ? { effort: reported.current.effort } : {})
  }
}
