// The findings a reply lists, one branch each: its numbered headings, else the items of its longest
// top-level list. Deterministic, so the same reply offers the same findings on desktop and phone.

export const CONVERSATION_BRANCH_FINDINGS_MAX = 20
const TITLE_MAX = 200
const TEXT_MAX = 2_000

export type ConversationBranchFinding = {
  /** 1-based position among the findings. */
  index: number
  /** The finding's first line, plain. */
  title: string
  /** The whole finding as written. */
  text: string
}

const LIST_ITEM = /^(?:\d+[.)]|[-*+])\s+(.*)$/
const NUMBERED_HEADING = /^#{1,6}\s+(?:(?:finding|issue|nález)\s*)?#?\d+[.):]?\s+(.*)$/i
const HEADING = /^#{1,6}\s/
const FENCE = /^\s*(?:```|~~~)/

function plain(line: string): string {
  return line
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** The reply's lines outside code fences; a fence's own lines become empty. */
function proseLines(markdown: string): string[] {
  let fenced = false
  return markdown.split('\n').map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced
      return ''
    }
    return fenced ? '' : line.trimEnd()
  })
}

type Block = string[][]

function numberedHeadingFindings(lines: string[]): Block {
  const findings: Block = []
  let current: string[] | null = null
  for (const line of lines) {
    const heading = NUMBERED_HEADING.exec(line)
    if (heading) {
      current = [heading[1] ?? '']
      findings.push(current)
    } else if (HEADING.test(line)) {
      current = null
    } else if (current) {
      current.push(line)
    }
  }
  return findings
}

/** Top-level list blocks: items and their indented or wrapped continuation lines. */
function listBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let block: Block | null = null
  let blankRun = 0
  for (const line of lines) {
    const item = LIST_ITEM.exec(line)
    if (item) {
      if (!block) {
        block = []
        blocks.push(block)
      }
      block.push([item[1] ?? ''])
      blankRun = 0
      continue
    }
    if (!block) {
      continue
    }
    if (line.trim() === '') {
      blankRun += 1
      continue
    }
    // Indented text belongs to the item above; prose after a blank line ends the list.
    if (/^\s/.test(line) || blankRun === 0) {
      block.at(-1)?.push(line.trim())
      blankRun = 0
      continue
    }
    block = null
  }
  return blocks
}

export function conversationBranchFindings(markdown: string): ConversationBranchFinding[] {
  const lines = proseLines(markdown)
  const headed = numberedHeadingFindings(lines)
  const chosen =
    headed.length >= 2
      ? headed
      : listBlocks(lines).reduce<Block>(
          (best, block) => (block.length > best.length ? block : best),
          []
        )
  if (chosen.length < 2) {
    return []
  }
  return chosen.slice(0, CONVERSATION_BRANCH_FINDINGS_MAX).map((item, offset) => {
    const body = item.filter((line) => line.trim() !== '')
    return {
      index: offset + 1,
      title: clip(plain(body[0] ?? ''), TITLE_MAX),
      text: clip(body.join('\n').trim(), TEXT_MAX)
    }
  })
}
