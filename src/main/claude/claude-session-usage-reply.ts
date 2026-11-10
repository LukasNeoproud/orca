import type { ClaudeSessionUsage, ClaudeUsageLimit } from '../../shared/claude-session-control'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a non-null, non-array object is checked on the line above.
      (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The CLI's experimental `get_usage` answer, reduced to what the chat shows. Read field by field:
 * the shape may change between CLI versions, and a part that is missing is simply not shown.
 */
export function claudeSessionUsage(answer: unknown): ClaudeSessionUsage {
  const usage = record(answer)
  const cost = record(usage?.session)?.total_cost_usd
  const listed = record(usage?.rate_limits)?.limits
  const plan = text(usage?.subscription_type)
  return {
    costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    ...(plan ? { plan } : {}),
    limits: (Array.isArray(listed) ? listed : []).flatMap((value): ClaudeUsageLimit[] => {
      const limit = record(value)
      const kind = text(limit?.kind)
      const percent = limit?.percent
      if (!limit || !kind || typeof percent !== 'number' || !Number.isFinite(percent)) {
        return []
      }
      const model = text(record(record(limit.scope)?.model)?.display_name)
      const resetsAt = text(limit.resets_at)
      const severity = text(limit.severity)
      return [
        {
          kind,
          percent,
          ...(model ? { model } : {}),
          ...(resetsAt ? { resetsAt } : {}),
          ...(severity ? { severity } : {})
        }
      ]
    })
  }
}
