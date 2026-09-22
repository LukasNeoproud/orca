import { describe, expect, it } from 'vitest'
import type { AgentSessionBranchRecord } from '../../../../shared/agent-session-branch'
import { conversationFamilyGraph } from './conversation-family-graph'

function branch(id: string, source: string, target: string, itemId: string, createdAt: number) {
  return {
    branchId: id,
    source: { sessionId: source, anchor: { epoch: 'epoch', itemId } },
    target: { sessionId: target },
    createdAt
  } as AgentSessionBranchRecord
}

describe('conversation origin graph', () => {
  it('keeps repeated fork points distinct and computes descendant depth', () => {
    const records = [
      branch('a', 'root', 'child', 'answer1', 1),
      branch('b', 'root', 'sibling', 'answer2', 2),
      branch('c', 'child', 'grandchild', 'answer3', 3),
      branch('d', 'root', 'alternative', 'answer1', 4)
    ]
    const graph = conversationFamilyGraph(records)
    expect(
      graph.map((point) => [point.depth, point.branches.map((entry) => entry.branchId)])
    ).toEqual([
      [0, ['a', 'd']],
      [0, ['b']],
      [1, ['c']]
    ])
    expect(records.map((entry) => entry.branchId)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('connects portable descendants through verified provider history aliases', () => {
    const records = [
      branch('a', 'parent-history', 'prepared-child', 'answer1', 1),
      branch('b', 'child-history', 'prepared-grandchild', 'answer2', 2),
      branch('c', 'grandchild-history', 'prepared-next', 'answer3', 3)
    ]
    const aliases = new Map([
      ['a', ['child-history']],
      ['b', ['grandchild-history']]
    ])
    expect(conversationFamilyGraph(records, aliases).map((point) => point.depth)).toEqual([0, 1, 2])
    expect(records[0]!.target.sessionId).toBe('prepared-child')
  })
  it('does not loop on malformed cyclic legacy relationships', () => {
    expect(
      conversationFamilyGraph([
        branch('a', 'one', 'two', 'a1', 1),
        branch('b', 'two', 'one', 'a2', 2)
      ])
    ).toHaveLength(2)
  })
})
