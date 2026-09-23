import { describe, expect, it, vi } from 'vitest'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/structured-agent-session-reducer'
import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionMutate } from './mobile-structured-agent-session-rpc'
import { stopMobileStructuredBackgroundTask } from './use-mobile-structured-session-stops'

const client = {} as RpcClient
const monitoring = {
  ...EMPTY_STRUCTURED_AGENT_SESSION,
  backgroundTasks: {
    state: 'monitoring' as const,
    supportsTaskStop: true,
    tasks: [{ id: 'task-1', kind: 'agent' as const, description: 'Review changes' }]
  }
}

describe('structured background task stop', () => {
  it('sends a targeted stop through the existing fenced mutation path', async () => {
    const mutate = vi.fn(async () => ({
      status: 'accepted' as const,
      value: { turnId: 'background-tasks', cancelled: true },
      sameFence: true
    }))
    const onSendError = vi.fn()
    expect(
      await stopMobileStructuredBackgroundTask({
        taskId: 'task-1',
        state: monitoring,
        client,
        connected: true,
        mutate: mutate as StructuredAgentSessionMutate,
        onSendError
      })
    ).toBe(true)
    expect(mutate).toHaveBeenCalledWith('agentSession.cancel', 'agentSession.cancel', {
      turnId: 'background-tasks',
      scope: 'background-tasks',
      taskId: 'task-1'
    })
    expect(onSendError).not.toHaveBeenCalled()
  })

  it('refuses targeted stops on older hosts and reports ambiguous delivery', async () => {
    const mutate = vi.fn(async () => ({ status: 'unknown' as const }))
    const onSendError = vi.fn()
    const args = {
      state: {
        ...monitoring,
        backgroundTasks: { ...monitoring.backgroundTasks, supportsTaskStop: false }
      },
      client,
      connected: true,
      mutate: mutate as StructuredAgentSessionMutate,
      onSendError
    }
    expect(await stopMobileStructuredBackgroundTask({ ...args, taskId: 'task-1' })).toBe(false)
    expect(mutate).not.toHaveBeenCalled()
    expect(await stopMobileStructuredBackgroundTask(args)).toBe(false)
    expect(onSendError).toHaveBeenCalledWith(
      'Background task stop unconfirmed — check chat before retrying'
    )
  })
})
