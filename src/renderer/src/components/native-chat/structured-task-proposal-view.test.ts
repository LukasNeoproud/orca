import { describe, expect, it } from 'vitest'
import { structuredTaskProposalWorkspaceRoute } from './structured-task-proposal-view'

describe('structured task proposal workspace route', () => {
  it('keeps the source execution host while routing through its pinned runtime', () => {
    expect(
      structuredTaskProposalWorkspaceRoute(
        {
          executionHostId: 'ssh:private-target',
          wslDistro: null,
          workspaceId: 'workspace',
          workspaceKind: 'git-worktree'
        },
        { kind: 'environment', environmentId: 'hub-a' }
      )
    ).toEqual({
      workspaceId: 'workspace',
      executionHostId: 'ssh:private-target',
      runtimeEnvironmentId: 'hub-a'
    })
  })

  it('does not borrow an active runtime for a local folder session', () => {
    expect(
      structuredTaskProposalWorkspaceRoute(
        {
          executionHostId: 'local',
          wslDistro: null,
          workspaceId: 'folder:docs',
          workspaceKind: 'folder'
        },
        { kind: 'local' }
      )
    ).toEqual({
      workspaceId: 'folder:docs',
      executionHostId: 'local',
      runtimeEnvironmentId: null
    })
  })
})
