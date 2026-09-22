import { describe, expect, it } from 'vitest'
import type { AgentSessionBranchRecord } from '../../../shared/agent-session-branch'
import { preparedAgentSessionBranchStartRefusal } from './structured-agent-session-branch-service'

const branch = {
  target: { sessionId: 'target-1' }
} as AgentSessionBranchRecord

describe('preparedAgentSessionBranchStartRefusal', () => {
  it('rejects a start after another child submission was durably recorded', () => {
    const host = {
      journalSnapshot: () => ({
        submissions: [{ clientMessageId: 'another-message' }]
      })
    } as never
    expect(preparedAgentSessionBranchStartRefusal(host, branch, 'branch-start')).toMatchObject({
      code: 'agent_session_operation_invalid'
    })
  })

  it('allows the same operation to retry its own unknown submission', () => {
    const host = {
      journalSnapshot: () => ({ submissions: [{ clientMessageId: 'branch-start' }] })
    } as never
    expect(preparedAgentSessionBranchStartRefusal(host, branch, 'branch-start')).toBeNull()
  })
})
