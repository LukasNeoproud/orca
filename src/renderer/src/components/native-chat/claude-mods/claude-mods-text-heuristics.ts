// Which Texts are ASCII art (they keep their columns in a monospace face) and which short
// tokens must never break mid-word. Both read only the strings a Text holds.

import type { ClaudeModsNode } from './claude-mods-tree'

/** Box-drawing or block characters, runs of `-=_~`, arrows, or aligned runs of spaces. */
const ART_CHARACTERS = /[─-▟]|[-=_~]{3,}|[-=]{2,}>|<[-=]{2,}|[←-↔⇐-⇔]/
const INNER_SPACE_RUN = /(?<=\S) {2,}(?=\S)/g
const SHORT_TOKEN_LENGTH = 24

function lineLooksLikeArt(line: string): boolean {
  if (ART_CHARACTERS.test(line)) {
    return true
  }
  const runs = line.match(INNER_SPACE_RUN) ?? []
  return runs.length >= 2 || runs.some((run) => run.length >= 3)
}

export function looksLikeAsciiArt(text: string): boolean {
  return text.split('\n').some(lineLooksLikeArt)
}

/** The text a node holds when every child is a string; otherwise undefined. */
export function claudeModsStringContent(children: ClaudeModsNode[]): string | undefined {
  let text = ''
  for (const child of children) {
    if (child.kind !== 'text') {
      return undefined
    }
    text += child.text
  }
  return text
}

function textOf(node: ClaudeModsNode): string {
  return node.kind === 'element' ? (claudeModsStringContent(node.children) ?? '') : ''
}

function isNonWrappingText(node: ClaudeModsNode): boolean {
  if (node.kind !== 'element' || node.type !== 'Text') {
    return false
  }
  const wrap = node.props.wrap
  return (
    typeof wrap === 'string' &&
    wrap !== 'wrap' &&
    claudeModsStringContent(node.children) !== undefined
  )
}

/**
 * Texts in a column of unwrapped lines are one picture: a contiguous run holding any art line
 * is drawn monospace as a whole, so columns keep their alignment.
 */
export function markMonospaceTexts(children: ClaudeModsNode[]): ClaudeModsNode[] {
  const marked = [...children]
  let start = 0
  while (start < children.length) {
    let end = start
    while (end < children.length && isNonWrappingText(children[end]!)) {
      end += 1
    }
    if (end === start) {
      start += 1
      continue
    }
    const run = children.slice(start, end)
    if (run.some((node) => looksLikeAsciiArt(textOf(node)))) {
      for (let index = start; index < end; index += 1) {
        marked[index] = withMono(children[index]!)
      }
    }
    start = end
  }
  return marked
}

/** A Text whose own string spans lines and holds art is monospace by itself. */
export function markMultilineMonospace(node: ClaudeModsNode): ClaudeModsNode {
  if (node.kind !== 'element' || node.type !== 'Text') {
    return node
  }
  const text = claudeModsStringContent(node.children)
  return text !== undefined && text.includes('\n') && looksLikeAsciiArt(text)
    ? withMono(node)
    : node
}

function withMono(node: ClaudeModsNode): ClaudeModsNode {
  return node.kind === 'element' && node.props.mono !== true
    ? { ...node, props: { ...node.props, mono: true } }
    : node
}

/**
 * How a wrapping Text may break: a short token never splits, and text whose words all fit
 * breaks only between words, where `anywhere` would split any word that met the edge.
 */
export function claudeModsWrapBehaviour(
  text: string | undefined
): { overflowWrap: 'break-word'; whiteSpace?: 'pre' } | undefined {
  if (text === undefined) {
    return undefined
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  if (trimmed.length <= SHORT_TOKEN_LENGTH && !/\s/.test(trimmed)) {
    return { overflowWrap: 'break-word', whiteSpace: 'pre' }
  }
  return trimmed.split(/\s+/).every((word) => word.length <= SHORT_TOKEN_LENGTH)
    ? { overflowWrap: 'break-word' }
    : undefined
}
