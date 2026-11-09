// The tree a conversation belongs to: its root and every branch point under it, for the family
// panel on desktop and phone. Pure data.

import { conversationBranchRoot, type ConversationBranchRecord } from './conversation-branch'

/** One turn branches started after, with those branches oldest first. */
export type ConversationBranchPoint = {
  key: string
  parentProviderSessionId: string
  excerpt: string
  /** How many branches deep the parent conversation is: 0 for the root. */
  depth: number
  branches: ConversationBranchRecord[]
}

export type ConversationBranchFamily = {
  rootProviderSessionId: string
  points: ConversationBranchPoint[]
}

/** The family `providerSessionId` belongs to, points in tree order: each after its parent's. */
export function conversationBranchFamily(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): ConversationBranchFamily {
  const rootProviderSessionId = conversationBranchRoot(branches, providerSessionId)
  const byParent = new Map<string, Map<string, ConversationBranchPoint>>()
  for (const branch of branches.toSorted((left, right) => left.createdAt - right.createdAt)) {
    const points = byParent.get(branch.parent.providerSessionId) ?? new Map()
    byParent.set(branch.parent.providerSessionId, points)
    const key = `${branch.parent.providerSessionId}\n${branch.parent.boundaryUuid}`
    const point = points.get(key) ?? {
      key,
      parentProviderSessionId: branch.parent.providerSessionId,
      excerpt: branch.parent.excerpt,
      depth: 0,
      branches: []
    }
    point.branches.push(branch)
    points.set(key, point)
  }
  const ordered: ConversationBranchPoint[] = []
  const visited = new Set<string>()
  const walk = (parentId: string, depth: number): void => {
    // A corrupt cycle must not loop; the depth bound matches conversationBranchRoot's.
    if (visited.has(parentId) || depth > 64) {
      return
    }
    visited.add(parentId)
    for (const point of byParent.get(parentId)?.values() ?? []) {
      ordered.push({ ...point, depth })
      for (const branch of point.branches) {
        if (branch.child.providerSessionId) {
          walk(branch.child.providerSessionId, depth + 1)
        }
      }
    }
  }
  walk(rootProviderSessionId, 0)
  return { rootProviderSessionId, points: ordered }
}

/** Whether `providerSessionId` has relatives: a parent or branches of its own. */
export function conversationBranchHasFamily(
  branches: readonly ConversationBranchRecord[],
  providerSessionId: string
): boolean {
  return branches.some(
    (branch) =>
      branch.parent.providerSessionId === providerSessionId ||
      branch.child.providerSessionId === providerSessionId
  )
}

/** Every conversation in the family, root first, for "is a relative working?" checks. */
export function conversationBranchFamilyMembers(family: ConversationBranchFamily): string[] {
  const members = [family.rootProviderSessionId]
  for (const point of family.points) {
    for (const branch of point.branches) {
      if (branch.child.providerSessionId) {
        members.push(branch.child.providerSessionId)
      }
    }
  }
  return members
}
