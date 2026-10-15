// A prompt a Claude Code plugin (a mod's `$.prompt.submit` or `$.command.run`) started a turn
// with. Orca never dispatched it, so no submission row exists: the CLI's replayed user frame,
// tagged `origin: { kind: 'plugin' }`, is the only record of what the turn answers.

import { claudeRecord, claudeText } from './claude-structured-item-translation'

// The CLI frames a plugin prompt for the model; the person should read only what was asked.
const SUBMITTED_PROMPT =
  /^The [^\n]+ plugin sent a message:\n([\s\S]*?)\n\nThis is how Claude Code surfaces a prompt a plugin submits/
const COMMAND_NAME = /<command-name>([^<]*)<\/command-name>/
const COMMAND_ARGS = /<command-args>([^<]*)<\/command-args>/

/** What a plugin-submitted prompt's bubble reads: the bare prompt, or `/command args`. */
export function claudePluginPromptText(text: string): string {
  const command = COMMAND_NAME.exec(text)?.[1]?.trim()
  if (command) {
    const args = COMMAND_ARGS.exec(text)?.[1]?.trim()
    const name = command.startsWith('/') ? command : `/${command}`
    return args ? `${name} ${args}` : name
  }
  return SUBMITTED_PROMPT.exec(text)?.[1]?.trim() || text
}

/** The text parts of a plugin-submitted prompt, rewritten for display; other parts unchanged. */
export function claudePluginPromptContent(content: unknown[]): unknown[] {
  return content.map((value) => {
    const part = claudeRecord(value)
    const text = claudeText(part?.text)
    return part?.type === 'text' && text ? { ...part, text: claudePluginPromptText(text) } : value
  })
}
