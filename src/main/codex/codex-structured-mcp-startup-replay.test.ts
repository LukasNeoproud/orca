import { describe, expect, it } from 'vitest'
import type { AgentJournalItemIdentity } from '../../shared/agent-session-journal-types'
import { CodexJournalGenericFrames } from './codex-structured-journal-generic-frames'

const kind = 'notification:mcpServer/startupStatus/updated'

describe('MCP startup replay across Codex handoffs', () => {
  it('keeps the same failure identity across acquisitions and notification order', () => {
    const identities: AgentJournalItemIdentity[] = []
    const create = () =>
      new CodexJournalGenericFrames(
        {
          sink: {
            appendItem: (identity) => {
              identities.push(identity)
            },
            appendTombstone: () => {},
            publish: () => {}
          }
        },
        () => null
      )
    const first = create()
    first.appendUnhandled(kind, { name: 'filesystem', status: 'failed', error: 'Auth expired' })
    first.appendUnhandled(kind, { name: 'search', status: 'failed', error: 'Auth expired' })
    first.dispose()
    const resumed = create()
    resumed.appendUnhandled(kind, { server: 'search', status: 'failed', error: 'Auth expired' })
    resumed.appendUnhandled(kind, { server: 'filesystem', status: 'failed', error: 'Auth expired' })
    resumed.appendUnhandled(kind, {
      name: 'filesystem',
      status: 'failed',
      error: 'Connection refused'
    })
    resumed.appendUnhandled(kind, {
      name: 'filesystem',
      status: 'failed',
      error: 'Auth expired',
      failureReason: 'Account disabled'
    })
    resumed.dispose()

    expect(identities[0]).toEqual(identities[3])
    expect(identities[1]).toEqual(identities[2])
    expect(identities[0]).not.toEqual(identities[1])
    expect(identities[0]).not.toEqual(identities[4])
    expect(identities[0]).not.toEqual(identities[5])
  })
})
