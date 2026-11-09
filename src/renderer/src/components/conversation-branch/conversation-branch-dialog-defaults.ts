import { CONVERSATION_BRANCH_LABEL_MAX } from '../../../../shared/conversation-branch'

const CLEAN_CONTEXT_MAX = 4_000

function plainLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^(?:[#>]+|[-*+]|\d+[.)])\s+/, '')
        .replace(/\*\*|`/g, '')
        .trim()
    )
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
}

/** A name for a branch made from `markdown`: its first line of prose, cut to the label limit. */
export function defaultConversationBranchLabel(markdown: string): string {
  const first = plainLines(markdown)[0] ?? ''
  const max = Math.min(CONVERSATION_BRANCH_LABEL_MAX, 80)
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`
}

/** A clean branch carries no history, so its draft quotes the reply it started from. */
export function defaultCleanBranchPrompt(markdown: string): string {
  const body = markdown.trim()
  const quoted = (
    body.length <= CLEAN_CONTEXT_MAX ? body : `${body.slice(0, CLEAN_CONTEXT_MAX).trimEnd()}…`
  )
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `Context from the conversation this one branched from:\n\n${quoted}\n\nTask: `
}
