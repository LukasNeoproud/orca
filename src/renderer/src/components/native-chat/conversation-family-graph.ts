import type { AgentSessionBranchRecord } from '../../../../shared/agent-session-branch'

export type ConversationGraphPoint = {
  key: string
  sourceSessionId: string
  depth: number
  branches: AgentSessionBranchRecord[]
}

export function conversationFamilyGraph(
  branches: readonly AgentSessionBranchRecord[],
  targetAliases?: ReadonlyMap<string, readonly string[]>
): ConversationGraphPoint[] {
  const parents = new Map(
    branches.flatMap((branch) =>
      [branch.target.sessionId, ...(targetAliases?.get(branch.branchId) ?? [])].map(
        (id) => [id, branch.source.sessionId] as const
      )
    )
  )
  const depthOf = (id: string): number => {
    const seen = new Set<string>()
    let cursor: string | undefined = id
    while (cursor && parents.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor)
      cursor = parents.get(cursor)
    }
    return seen.size
  }
  const points = new Map<string, ConversationGraphPoint>()
  for (const branch of [...branches].sort(
    (a, b) => a.createdAt - b.createdAt || a.branchId.localeCompare(b.branchId)
  )) {
    const key = JSON.stringify([
      branch.source.sessionId,
      branch.source.anchor.epoch,
      branch.source.anchor.itemId
    ])
    const point = points.get(key) ?? {
      key,
      sourceSessionId: branch.source.sessionId,
      depth: depthOf(branch.source.sessionId),
      branches: []
    }
    point.branches.push(branch)
    points.set(key, point)
  }
  return [...points.values()].sort((a, b) => a.depth - b.depth)
}
