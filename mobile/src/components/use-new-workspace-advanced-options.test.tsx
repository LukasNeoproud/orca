import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'
import { useNewWorkspaceAdvancedOptions } from './use-new-workspace-advanced-options'

const repo: MobileWorkspaceRepo = { id: 'repo-1', displayName: 'Orca', path: '/orca', kind: 'git' }

describe('useNewWorkspaceAdvancedOptions', () => {
  it('loads local presets and keeps the selected preset scoped to its repository', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        presets: [{ id: 'preset-1', repoId: 'repo-1', name: 'Mobile', directories: ['mobile'] }]
      }
    })
    const client = { sendRequest } as unknown as RpcClient
    let current!: ReturnType<typeof useNewWorkspaceAdvancedOptions>
    function Harness({ selectedRepo }: { selectedRepo: MobileWorkspaceRepo }) {
      current = useNewWorkspaceAdvancedOptions({ client, visible: true, repo: selectedRepo })
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { selectedRepo: repo }))
    })
    expect(sendRequest).toHaveBeenCalledWith('repo.sparsePresets', { repo: 'id:repo-1' })
    act(() => current.setSelectedPresetId('preset-1'))
    expect(current.sparseCheckout).toEqual({ directories: ['mobile'], presetId: 'preset-1' })
    act(() =>
      renderer.update(
        createElement(Harness, {
          selectedRepo: { ...repo, id: 'repo-2' }
        })
      )
    )
    expect(current.sparseCheckout).toBeUndefined()
    act(() => renderer.unmount())
  })

  it('does not offer sparse checkout on an SSH repository', async () => {
    const sendRequest = vi.fn()
    const client = { sendRequest } as unknown as RpcClient
    let available = true
    function Harness() {
      available = useNewWorkspaceAdvancedOptions({
        client,
        visible: true,
        repo: { ...repo, connectionId: 'ssh-1' }
      }).canUseSparse
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    expect(available).toBe(false)
    expect(sendRequest).not.toHaveBeenCalled()
    act(() => renderer.unmount())
  })
  it('does not carry display label or base ref into another repository', async () => {
    const client = {
      sendRequest: vi.fn().mockResolvedValue({ ok: true, result: { presets: [] } })
    } as unknown as RpcClient
    let current!: ReturnType<typeof useNewWorkspaceAdvancedOptions>
    function Harness({ selectedRepo }: { selectedRepo: MobileWorkspaceRepo }) {
      current = useNewWorkspaceAdvancedOptions({ client, visible: true, repo: selectedRepo })
      return null
    }
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(createElement(Harness, { selectedRepo: repo }))
    })
    act(() => {
      current.setDisplayLabel('Project A')
      current.setBaseRef('only-in-a')
    })
    expect(current.displayLabel).toBe('Project A')
    expect(current.baseRef).toBe('only-in-a')
    await act(async () => {
      renderer.update(createElement(Harness, { selectedRepo: { ...repo, id: 'repo-2' } }))
    })
    expect(current.displayLabel).toBe('')
    expect(current.baseRef).toBe('')
    act(() => renderer.unmount())
  })
})
