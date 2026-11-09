// A Claude transcript's main chain read as turns: each one opens on a prompt and ends on the last
// entry before the next prompt. A branch forks at a turn's last entry, never mid-turn, which is the
// fork point the SDK's `resumeDropsTurn` contract asks for.

import { readFile } from 'node:fs/promises'
import { CONVERSATION_BRANCH_EXCERPT_MAX } from '../../shared/conversation-branch'

const MAX_CHAIN = 50_000

type ChainEntry = {
  uuid: string
  parentUuid: string | null
  type: string
  prompt: boolean
  text: string
}

export type ClaudeTranscriptTurn = {
  promptUuid: string
  boundaryUuid: string
  prompt: string
  reply: string
  /** The reply as written, for a caller that hands it on whole. */
  replyText: string
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((block) =>
      block && typeof block === 'object' && 'text' in block && typeof block.text === 'string'
        ? block.text
        : ''
    )
    .join('\n')
}

function hasToolResult(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.some((block) => !!block && typeof block === 'object' && block.type === 'tool_result')
  )
}

function readEntry(row: Record<string, unknown>): ChainEntry | null {
  const uuid = nonEmpty(row.uuid)
  const type = nonEmpty(row.type)
  // Metadata rows (a fork's `custom-title`) carry a uuid but no parent: never the chain's newest.
  const linked = 'parentUuid' in row || 'logicalParentUuid' in row
  if (!uuid || !type || !linked || row.isSidechain === true) {
    return null
  }
  const message = row.message && typeof row.message === 'object' ? row.message : null
  const content = message && 'content' in message ? message.content : undefined
  const text = contentText(content)
  // A compaction restarts the chain at null; its logical parent keeps the earlier turns reachable.
  const parentUuid = nonEmpty(row.parentUuid) ?? nonEmpty(row.logicalParentUuid)
  const prompt =
    type === 'user' &&
    row.isMeta !== true &&
    row.isCompactSummary !== true &&
    !hasToolResult(content) &&
    !text.startsWith('<local-command-')
  return { uuid, parentUuid, type, prompt, text }
}

/** Short and plain, but keeping its lines so the first one can name a branch. */
function excerpt(text: string): string {
  const plain = text
    .replace(/<\/?command-[a-z]+>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain.length <= CONVERSATION_BRANCH_EXCERPT_MAX
    ? plain
    : `${plain.slice(0, CONVERSATION_BRANCH_EXCERPT_MAX - 1).trimEnd()}…`
}

/** The main chain from the root to the newest entry, oldest first, and the directory Claude ran
 *  in, which is where a `--resume` of this conversation has to start. */
export function claudeTranscriptMainChain(transcript: string): {
  chain: ChainEntry[]
  cwd: string | null
} {
  const entries = new Map<string, ChainEntry>()
  let leaf: string | null = null
  let cwd: string | null = null
  for (const line of transcript.split('\n')) {
    if (!line.trim()) {
      continue
    }
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      // A torn final line while Claude is still appending.
      continue
    }
    if (!row || typeof row !== 'object') {
      continue
    }
    cwd = ('cwd' in row ? nonEmpty(row.cwd) : null) ?? cwd
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a parsed JSON object; readEntry checks every field it reads.
    const entry = readEntry(row as Record<string, unknown>)
    if (entry && !entries.has(entry.uuid)) {
      entries.set(entry.uuid, entry)
      leaf = entry.uuid
    }
  }
  const reversed: ChainEntry[] = []
  const visited = new Set<string>()
  for (let cursor = leaf; cursor && reversed.length < MAX_CHAIN;) {
    const entry = entries.get(cursor)
    if (!entry || visited.has(cursor)) {
      break
    }
    visited.add(cursor)
    reversed.push(entry)
    cursor = entry.parentUuid
  }
  return { chain: reversed.toReversed(), cwd }
}

/** Every turn the agent answered in prose, in order. Whether the newest one has finished is the
 *  caller's to know: the transcript cannot tell. */
export function claudeTranscriptTurns(chain: readonly ChainEntry[]): ClaudeTranscriptTurn[] {
  const starts = chain.flatMap((entry, index) => (entry.prompt ? [index] : []))
  return starts.flatMap((start, position) => {
    const end = (starts[position + 1] ?? chain.length) - 1
    const turn = chain.slice(start, end + 1)
    const reply = turn.findLast((entry) => entry.type === 'assistant' && entry.text.trim())
    if (!reply) {
      return []
    }
    return [
      {
        promptUuid: chain[start].uuid,
        boundaryUuid: chain[end].uuid,
        prompt: excerpt(chain[start].text),
        reply: excerpt(reply.text),
        replyText: reply.text
      }
    ]
  })
}

export async function readClaudeTranscriptTurns(
  transcriptPath: string
): Promise<{ turns: ClaudeTranscriptTurn[]; cwd: string | null }> {
  const { chain, cwd } = claudeTranscriptMainChain(await readFile(transcriptPath, 'utf8'))
  return { turns: claudeTranscriptTurns(chain), cwd }
}

/** The turn opened by `promptUuid`; refuses a prompt that is not on the main chain. */
export async function resolveClaudeTranscriptTurn(
  transcriptPath: string,
  promptUuid: string
): Promise<{ turn: ClaudeTranscriptTurn; cwd: string | null }> {
  const { turns, cwd } = await readClaudeTranscriptTurns(transcriptPath)
  const turn = turns.find((candidate) => candidate.promptUuid === promptUuid)
  if (!turn) {
    throw new Error('conversation_branch_invalid_anchor')
  }
  return { turn, cwd }
}
