import { readFile } from 'node:fs/promises'

type Node = { uuid: string; parentUuid: string | null; type: string; prompt: boolean }

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function isPrompt(row: Record<string, unknown>): boolean {
  if (row.type !== 'user' || row.parent_tool_use_id != null) {
    return false
  }
  const message = row.message
  if (!message || typeof message !== 'object') {
    return true
  }
  const content = (message as { content?: unknown }).content
  return !(
    Array.isArray(content) &&
    content.some(
      (block) =>
        !!block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_result'
    )
  )
}

/** Last main-chain entry belonging to the selected completed response. */
export async function resolveClaudeTranscriptForkBoundary(input: {
  transcriptPath: string
  providerSessionId: string
  selectedUuid: string
  leafUuid: string
}): Promise<string> {
  const nodes = new Map<string, Node>()
  for (const line of (await readFile(input.transcriptPath, 'utf8')).split('\n')) {
    if (!line.trim()) {
      continue
    }
    const row = JSON.parse(line) as Record<string, unknown>
    const uuid = text(row.uuid)
    if (!uuid || text(row.sessionId) !== input.providerSessionId || row.isSidechain === true) {
      continue
    }
    nodes.set(uuid, {
      uuid,
      parentUuid: row.parentUuid === null ? null : text(row.parentUuid),
      type: text(row.type) ?? '',
      prompt: isPrompt(row)
    })
  }
  const reverse: Node[] = []
  const visited = new Set<string>()
  let cursor: string | null = input.leafUuid
  while (cursor && reverse.length < 10_000) {
    if (visited.has(cursor)) {
      throw new Error('agent_session_branch_provider_history_invalid')
    }
    visited.add(cursor)
    const node = nodes.get(cursor)
    if (!node) {
      throw new Error('agent_session_branch_provider_history_invalid')
    }
    reverse.push(node)
    cursor = node.parentUuid
  }
  const chain = reverse.toReversed()
  const selected = chain.findIndex((node) => node.uuid === input.selectedUuid)
  if (selected === -1 || chain[selected]?.type !== 'assistant') {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  const nextPrompt = chain.findIndex((node, index) => index > selected && node.prompt)
  const end = nextPrompt === -1 ? chain.length : nextPrompt
  if (chain.slice(selected + 1, end).some((node) => node.type === 'assistant')) {
    throw new Error('agent_session_branch_invalid_anchor')
  }
  return chain[end - 1]?.uuid ?? input.selectedUuid
}
