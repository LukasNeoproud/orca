import { describe, expect, it } from 'vitest'
import { claudeTranscriptMainChain, claudeTranscriptTurns } from './claude-transcript-turns'

type Row = Record<string, unknown>

const user = (uuid: string, parentUuid: string | null, content: unknown, extra: Row = {}): Row => ({
  type: 'user',
  uuid,
  parentUuid,
  cwd: '/work',
  message: { role: 'user', content },
  ...extra
})
const assistant = (uuid: string, parentUuid: string, text: string): Row => ({
  type: 'assistant',
  uuid,
  parentUuid,
  message: { role: 'assistant', content: [{ type: 'text', text }] }
})
const attachment = (uuid: string, parentUuid: string): Row => ({
  type: 'attachment',
  uuid,
  parentUuid
})

function turns(rows: Row[]) {
  const transcript = [...rows.map((row) => JSON.stringify(row)), '{"type":"last-prompt"}'].join(
    '\n'
  )
  return claudeTranscriptTurns(claudeTranscriptMainChain(transcript).chain)
}

describe('claudeTranscriptTurns', () => {
  it('ends a turn on its last entry before the next prompt, attachments and tool results included', () => {
    expect(
      turns([
        user('p1', null, 'Review the change'),
        assistant('a1', 'p1', 'Running the tests'),
        user('t1', 'a1', [{ type: 'tool_result', content: 'ok' }]),
        assistant('a2', 't1', 'Found 2 issues: 1. null check 2. race'),
        attachment('x1', 'a2'),
        user('p2', 'x1', 'Fix issue 1'),
        assistant('a3', 'p2', 'Fixed')
      ])
    ).toEqual([
      {
        promptUuid: 'p1',
        boundaryUuid: 'x1',
        prompt: 'Review the change',
        reply: 'Found 2 issues: 1. null check 2. race'
      },
      { promptUuid: 'p2', boundaryUuid: 'a3', prompt: 'Fix issue 1', reply: 'Fixed' }
    ])
  })

  it('keeps turns before a compaction reachable through its logical parent', () => {
    const listed = turns([
      user('p1', null, 'one'),
      assistant('a1', 'p1', 'one'),
      {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'c1',
        parentUuid: null,
        logicalParentUuid: 'a1'
      },
      user('s1', 'c1', 'This session is being continued', { isCompactSummary: true }),
      user('m1', 's1', '<local-command-caveat>Caveat</local-command-caveat>', { isMeta: true }),
      user('o1', 'm1', '<local-command-stdout>Compacted</local-command-stdout>'),
      user('p2', 'o1', 'two'),
      assistant('a2', 'p2', 'two')
    ])
    expect(listed.map((turn) => [turn.promptUuid, turn.boundaryUuid])).toEqual([
      ['p1', 'o1'],
      ['p2', 'a2']
    ])
  })

  it('follows the newest branch and skips sidechain entries and turns with no prose reply', () => {
    const listed = turns([
      user('p1', null, 'start'),
      assistant('a1', 'p1', 'ok'),
      user('old', 'a1', 'abandoned by a rewind'),
      { ...assistant('side', 'a1', 'side chain'), isSidechain: true },
      user('p2', 'a1', 'kept'),
      {
        type: 'assistant',
        uuid: 'a2',
        parentUuid: 'p2',
        message: { content: [{ type: 'tool_use' }] }
      }
    ])
    expect(listed.map((turn) => turn.promptUuid)).toEqual(['p1'])
  })

  it('reports the directory Claude ran in and survives a torn final line', () => {
    const transcript = `${JSON.stringify(user('p1', null, 'hi'))}\n{"type":"assist`
    expect(claudeTranscriptMainChain(transcript).cwd).toBe('/work')
  })
})
