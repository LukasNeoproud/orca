import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import type { AgentJournalPromptOption } from '../../shared/agent-session-journal-types'

const DESTINATION_WORDS: Record<string, string> = {
  session: 'for this session',
  localSettings: 'in this project, for you',
  projectSettings: 'in this project, for everyone',
  userSettings: 'in all your projects',
  cliArg: 'for this session'
}

function ruleText(rule: { toolName: string; ruleContent?: string }): string {
  return rule.ruleContent ? `${rule.toolName}(${rule.ruleContent})` : rule.toolName
}

/** Read defensively: the CLI's suggestions arrive unvalidated. */
function describe(update: PermissionUpdate): string | null {
  switch (update.type) {
    case 'addRules':
    case 'replaceRules':
      return Array.isArray(update.rules) && update.rules.length > 0
        ? update.rules.map(ruleText).join(', ')
        : null
    case 'setMode':
      return `switch to ${update.mode} mode`
    case 'addDirectories':
      return Array.isArray(update.directories) && update.directories.length > 0
        ? `access to ${update.directories.join(', ')}`
        : null
    default:
      return null
  }
}

/**
 * The "don't ask again" option for what the CLI itself proposes to remember, or null when it
 * proposed nothing: the option would then do exactly what Allow does.
 */
export function claudeRememberedAllowOption(
  suggestions: readonly PermissionUpdate[]
): AgentJournalPromptOption | null {
  if (suggestions.length === 0) {
    return null
  }
  const parts = suggestions.flatMap((update) => describe(update) ?? [])
  if (parts.length === 0) {
    // Something Orca cannot put into words is still the CLI's proposal: offer it unexplained.
    return { id: 'allowForSession', label: 'Allow for this session' }
  }
  const destinations = [...new Set(suggestions.map((update) => update.destination))]
  const sessionOnly = destinations.every(
    (destination) => destination === 'session' || destination === 'cliArg'
  )
  const where = destinations.length === 1 ? DESTINATION_WORDS[destinations[0]!] : undefined
  return {
    id: 'allowForSession',
    label: sessionOnly ? 'Allow for this session' : 'Always allow',
    description: where ? `${parts.join('; ')} — ${where}` : parts.join('; ')
  }
}
