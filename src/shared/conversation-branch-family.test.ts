import { describe, expect, it } from 'vitest'
import { branchRecord } from './conversation-branch.test-fixture'
import {
  conversationBranchFamily,
  conversationBranchFamilyMembers,
  conversationBranchHasFamily
} from './conversation-branch-family'

function branch(id: string, parent: string, child: string | null, boundary: string, at: number) {
  return branchRecord({
    branchId: id,
    requestId: id,
    parent: {
      providerSessionId: parent,
      promptUuid: `p-${boundary}`,
      boundaryUuid: boundary,
      excerpt: boundary
    },
    child: { providerSessionId: child, surface: 'chat' },
    createdAt: at
  })
}

const branches = [
  branch('b2', 'root', 'child-2', 'review', 2),
  branch('b1', 'root', 'child-1', 'review', 1),
  branch('b3', 'child-1', 'grandchild', 'fix', 3),
  branch('b4', 'root', 'child-4', 'later', 4),
  branch('other', 'unrelated', 'x', 'y', 5)
]

describe('conversationBranchFamily', () => {
  it('groups branches by the turn they started after, in tree order, from any member', () => {
    const family = conversationBranchFamily(branches, 'grandchild')
    expect(family.rootProviderSessionId).toBe('root')
    expect(
      family.points.map((point) => [
        point.excerpt,
        point.depth,
        point.branches.map((b) => b.branchId)
      ])
    ).toEqual([
      ['review', 0, ['b1', 'b2']],
      ['fix', 1, ['b3']],
      ['later', 0, ['b4']]
    ])
    expect(conversationBranchFamilyMembers(family)).toEqual([
      'root',
      'child-1',
      'child-2',
      'grandchild',
      'child-4'
    ])
  })

  it('survives a corrupt cycle and tells a lone conversation from a related one', () => {
    const cycle = [branch('a', 'x', 'y', 'one', 1), branch('b', 'y', 'x', 'two', 2)]
    expect(conversationBranchFamily(cycle, 'x').points.length).toBeLessThanOrEqual(2)
    expect(conversationBranchHasFamily(branches, 'child-4')).toBe(true)
    expect(conversationBranchHasFamily(branches, 'stranger')).toBe(false)
  })
})
