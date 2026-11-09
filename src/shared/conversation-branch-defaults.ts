import {
  CONVERSATION_BRANCH_FOCUS_MAX,
  CONVERSATION_BRANCH_LABEL_MAX,
  type ConversationBranchMode
} from './conversation-branch'
import type { ConversationBranchFinding } from './conversation-branch-findings'

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

/** A finding's branch name: its number and first line, as the reply listed them. */
export function defaultFindingBranchLabel(finding: ConversationBranchFinding): string {
  // Not through the reply's label: that drops the list number this one is built from.
  const label = `${finding.index}. ${finding.title}`
  return label.length <= 80 ? label : `${label.slice(0, 79).trimEnd()}…`
}

/** What a finding's branch is asked to do. A clean branch has no history, so it quotes the finding. */
export function defaultFindingBranchPrompt(
  finding: ConversationBranchFinding,
  mode: ConversationBranchMode
): string {
  return mode === 'clean'
    ? `${defaultCleanBranchPrompt(finding.text)}Fix this finding.`
    : `Fix finding ${finding.index}: ${finding.title}`
}

/** A summary that keeps what one finding needs. */
export function defaultFindingBranchFocus(finding: ConversationBranchFinding): string {
  const focus = `Finding ${finding.index}: ${finding.text}`
  return focus.length <= CONVERSATION_BRANCH_FOCUS_MAX
    ? focus
    : focus.slice(0, CONVERSATION_BRANCH_FOCUS_MAX)
}
