import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { createBlankWorkspace } from './blank-workspace-create'
import {
  buildMobileExplicitWorktreeCreation,
  previewMobileExplicitWorktreeCreation
} from './mobile-explicit-worktree-creation'

const creation = buildMobileExplicitWorktreeCreation({
  name: 'feature/mobile',
  selection: null,
  location: 'inside',
  customRoot: '',
  layout: 'flat'
})!

describe('mobile explicit worktree creation', () => {
  it('builds host-relative destinations and keeps branch names distinct from flat folders', () => {
    expect(creation).toEqual({
      branch: { kind: 'new', name: 'feature/mobile' },
      destination: { root: '.worktrees', relativeDirectory: 'feature-mobile' }
    })
    expect(
      buildMobileExplicitWorktreeCreation({
        name: 'workspace-name',
        branchNameOverride: 'feature/kept',
        selection: null,
        location: 'inside',
        customRoot: '',
        layout: 'nested'
      })?.branch
    ).toEqual({ kind: 'new', name: 'feature/kept' })
    expect(
      buildMobileExplicitWorktreeCreation({
        name: 'feature/mobile',
        selection: {
          kind: 'branch',
          baseBranch: 'main',
          refName: 'origin/topic',
          localBranchName: 'topic',
          reuse: true
        },
        location: 'orca-default',
        customRoot: '',
        layout: 'nested'
      })
    ).toEqual({
      branch: { kind: 'local', name: 'topic' },
      destination: { relativeDirectory: 'feature/mobile' }
    })
  })

  it('refuses a missing custom root or linked work item before sending an RPC', () => {
    expect(
      buildMobileExplicitWorktreeCreation({
        name: 'named',
        selection: null,
        location: 'custom',
        customRoot: '',
        layout: 'nested'
      })
    ).toBeNull()
    expect(
      buildMobileExplicitWorktreeCreation({
        name: '',
        selection: null,
        location: 'inside',
        customRoot: '',
        layout: 'nested'
      })
    ).toBeNull()
  })

  it('fails closed when a host lacks preview or explicit create', async () => {
    const calls: string[] = []
    const client = {
      sendRequest: async (method: string) => {
        calls.push(method)
        return {
          id: '1',
          ok: false,
          error: { code: 'method_not_found', message: 'unsupported' }
        }
      }
    } as unknown as RpcClient
    await expect(
      previewMobileExplicitWorktreeCreation({
        client,
        repoId: 'r',
        name: 'feature/mobile',
        explicitCreation: creation
      })
    ).rejects.toThrow('Update Orca')
    const result = await createBlankWorkspace({
      client,
      repoId: 'r',
      baseName: 'feature/mobile',
      createdWithAgentId: undefined,
      comment: undefined,
      setupDecision: 'inherit',
      nameWasGenerated: false,
      agentLaunchSupported: false,
      worktreeCreateIdempotency: false,
      explicitCreation: creation
    })
    expect(result).toEqual({ error: 'Update Orca on the host to choose a worktree location.' })
    expect(calls).toEqual(['worktree.previewCreation', 'worktree.createExplicit'])
  })

  it('sends the explicit path through the distinct create method with idempotency', async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = []
    const client = {
      sendRequest: async (method: string, params: Record<string, unknown>) => {
        calls.push({ method, params })
        return { id: '1', ok: true, result: { worktree: { id: 'wt-1' } } }
      }
    } as unknown as RpcClient
    const overriddenCreation = {
      ...creation,
      branch: { kind: 'new' as const, name: 'feature/kept' }
    }
    await createBlankWorkspace({
      client,
      repoId: 'r',
      baseName: 'feature/mobile',
      createdWithAgentId: undefined,
      comment: undefined,
      branchNameOverride: 'feature/kept',
      setupDecision: 'inherit',
      nameWasGenerated: false,
      agentLaunchSupported: false,
      worktreeCreateIdempotency: { dedupeTtlMs: 60_000 },
      explicitCreation: overriddenCreation
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: 'worktree.createExplicit',
      params: {
        explicitCreation: overriddenCreation,
        branchNameOverride: 'feature/kept',
        clientMutationId: expect.any(String)
      }
    })
  })
})
