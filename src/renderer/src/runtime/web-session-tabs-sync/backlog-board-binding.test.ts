import { describe, expect, it } from 'vitest'
import { rebaseBacklogBoardBinding } from './mirrored-browser-tabs'

describe('paired Backlog.md board binding', () => {
  it('rebases a host-local board separately for each viewer environment', () => {
    const hostBinding = {
      workspaceId: 'wt-1',
      executionHostId: 'local' as const,
      runtimeEnvironmentId: null
    }

    expect(rebaseBacklogBoardBinding(hostBinding, 'viewer-a')).toEqual({
      workspaceId: 'wt-1',
      executionHostId: 'runtime:viewer-a',
      runtimeEnvironmentId: 'viewer-a'
    })
    expect(rebaseBacklogBoardBinding(hostBinding, 'viewer-b')).toEqual({
      workspaceId: 'wt-1',
      executionHostId: 'runtime:viewer-b',
      runtimeEnvironmentId: 'viewer-b'
    })
  })

  it('keeps an SSH execution host behind the paired runtime', () => {
    expect(
      rebaseBacklogBoardBinding(
        {
          workspaceId: 'wt-ssh',
          executionHostId: 'ssh:target-1',
          runtimeEnvironmentId: null
        },
        'viewer-a'
      )
    ).toEqual({
      workspaceId: 'wt-ssh',
      executionHostId: 'ssh:target-1',
      runtimeEnvironmentId: 'viewer-a'
    })
  })
})
