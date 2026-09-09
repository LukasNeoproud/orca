/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RuntimeRpcClient from '@/runtime/runtime-rpc-client'
import { BranchWorktreeDialog } from './BranchWorktreeDialog'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), fetch: vi.fn(), open: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: { activeRuntimeEnvironmentId: 'active-host' },
      activeWorktreeId: 'r::/repo',
      activeWorkspaceExecutionHostId: 'runtime:active-host',
      worktreesByRepo: {},
      updateWorktreeMeta: mocks.update,
      fetchWorktrees: mocks.fetch
    })
  }
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'ssh:box',
  getSettingsForWorktreeRuntimeOwner: () => ({ activeRuntimeEnvironmentId: null })
}))
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeRpcClient>()),
  callRuntimeRpc: mocks.rpc
}))
vi.mock('@/lib/open-registered-worktree', () => ({ openRegisteredWorktree: mocks.open }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ translate: (_: string, fallback: string) => fallback }))
vi.mock('@/components/ui/dialog', () => {
  const Container = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  return {
    Dialog: Container,
    DialogContent: Container,
    DialogHeader: Container,
    DialogTitle: Container,
    DialogDescription: Container
  }
})
let container: HTMLDivElement
let root: Root
const preview = {
  path: '/repo',
  current: 'main',
  head: 'abc123',
  branches: ['main'],
  worktrees: [],
  blockers: [],
  sessions: []
}
const worktree = makeWorktree({
  id: 'r::/repo',
  repoId: 'r',
  path: '/repo',
  displayName: 'My label',
  hostId: 'ssh:box'
})
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue(preview)
  mocks.update.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<BranchWorktreeDialog worktree={worktree} onOpenChange={() => {}} />)
  })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text
  )!
  await act(async () => {
    button.click()
  })
}
describe('Branch & worktree', () => {
  it('routes mirrored rows using their runtime provenance when hostId is absent', async () => {
    await act(async () => {
      root.render(
        <BranchWorktreeDialog
          worktree={{ ...worktree, hostId: undefined, runtimeOwnerEnvironmentId: 'mirror-host' }}
          onOpenChange={() => {}}
        />
      )
    })
    expect(mocks.rpc.mock.lastCall?.[0]).toEqual({
      kind: 'environment',
      environmentId: 'mirror-host'
    })
    await click('Save label')
    expect(mocks.update.mock.lastCall?.[2]).toEqual({ executionHostId: 'runtime:mirror-host' })
  })
  it('does not borrow an active same-ID owner when the dialog provenance is missing', async () => {
    mocks.rpc.mockClear()
    await act(async () => {
      root.render(
        <BranchWorktreeDialog
          worktree={{ ...worktree, hostId: undefined }}
          onOpenChange={() => {}}
        />
      )
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'worktree_execution_host_unresolved'
    )
    await click('Save label')
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('routes an inactive same-ID checkout to its explicit execution host', async () => {
    expect(mocks.rpc.mock.calls[0][0]).toEqual({ kind: 'local' })
    await act(async () => {
      root.render(
        <BranchWorktreeDialog
          worktree={{ ...worktree, hostId: 'runtime:other-host' }}
          onOpenChange={() => {}}
        />
      )
    })
    expect(mocks.rpc.mock.lastCall?.[0]).toEqual({
      kind: 'environment',
      environmentId: 'other-host'
    })
    await act(async () => {
      const input = container.querySelector('#managed-branch') as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'topic'
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Apply branch change')
    expect(mocks.rpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'other-host' },
      'git.manageBranch',
      { worktree: 'id:r::/repo', action: 'switch', branch: 'topic' },
      expect.any(Object)
    )
    expect(mocks.fetch).toHaveBeenCalledWith('r', { executionHostId: 'runtime:other-host' })
  })
  it('keeps label saving explicit and separate from branch mutation', async () => {
    await click('Save label')
    expect(mocks.update).toHaveBeenCalledWith(
      'r::/repo',
      { displayName: 'My label', displayNameIsPinned: true },
      { executionHostId: 'ssh:box' }
    )
    expect(mocks.rpc.mock.calls.map((call) => call[1])).toEqual(['git.branchManagementPreview'])
  })
  it('uses branch for label only after the explicit suggestion and save actions', async () => {
    await click('Use current branch as sidebar name')
    expect(mocks.update).not.toHaveBeenCalled()
    expect((container.querySelector('#worktree-sidebar-label') as HTMLInputElement).value).toBe(
      'main'
    )
    await click('Save label')
    expect(mocks.update.mock.calls[0][1]).toEqual({
      displayName: 'main',
      displayNameIsPinned: true
    })
  })
  it('keeps input and persistent unsupported-host error when refreshing fails', async () => {
    mocks.rpc.mockRejectedValue(new Error('Method not found: git.branchManagementPreview'))
    await click('Refresh')
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Method not found')
    expect((container.querySelector('#worktree-sidebar-label') as HTMLInputElement).value).toBe(
      'My label'
    )
    expect(
      [...container.querySelectorAll('button')].find(
        (item) => item.textContent === 'Apply branch change'
      )?.disabled
    ).toBe(true)
  })
})
