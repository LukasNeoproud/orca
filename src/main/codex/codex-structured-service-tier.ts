import type { AgentSessionConfigOption } from '../../shared/agent-session-wire'

function tierId(value: unknown): string | undefined {
  const id =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'id' in value
        ? value.id
        : undefined
  return typeof id === 'string' ? (id === 'fast' ? 'priority' : id) : undefined
}

export function readCodexModelServiceTiers(row: Record<string, unknown>): string[] | undefined {
  const tiers = Array.isArray(row.serviceTiers)
    ? row.serviceTiers
    : Array.isArray(row.additionalSpeedTiers)
      ? row.additionalSpeedTiers
      : null
  return tiers?.map(tierId).filter((id): id is string => id !== undefined)
}

export function codexFastModeOption(
  tiers: readonly string[] | undefined,
  current: string | null | undefined,
  modelDefault?: string | null
): AgentSessionConfigOption | null {
  if (!tiers?.includes('priority')) {
    return null
  }
  const currentValue = current === null ? (tierId(modelDefault) ?? 'default') : tierId(current)
  return {
    id: 'serviceTier',
    label: 'Fast mode',
    category: 'model_config',
    choices: [
      { value: 'default', label: 'Off', description: 'Standard speed and usage.' },
      { value: 'priority', label: 'Fast', description: 'Faster responses with higher usage.' }
    ],
    ...(currentValue === 'default' || currentValue === 'priority' ? { currentValue } : {})
  }
}
