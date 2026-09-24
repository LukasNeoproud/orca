import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { getCachedRepos } from '../cache/repo-cache'
import { useMobileAddProject, type MobileAddProjectInput } from './use-mobile-add-project'

type AddHook = ReturnType<typeof useMobileAddProject>
let hook: AddHook
let renderer: ReactTestRenderer | undefined

function Harness(props: Parameters<typeof useMobileAddProject>[0]) {
  hook = useMobileAddProject(props)
  return null
}

async function mount(client: RpcClient, onCreated = vi.fn(), onRefresh = vi.fn()) {
  await act(async () => {
    renderer = create(
      <Harness
        client={client}
        hostId="add-project-test-host"
        visible
        onCreated={onCreated}
        onRefresh={onRefresh}
      />
    )
  })
  return { onCreated, onRefresh }
}

const baseInput: MobileAddProjectInput = {
  mode: 'existing',
  kind: 'git',
  path: ' /srv/orca ',
  name: '',
  url: ''
}

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

describe('useMobileAddProject', () => {
  it.each([
    ['existing', 'repo.add', { path: '/srv/orca', kind: 'git' }],
    ['create', 'repo.create', { parentPath: '/srv/orca', name: 'new-app', kind: 'folder' }],
    ['clone', 'repo.clone', { url: 'https://example.com/orca.git', destination: '/srv/orca' }]
  ] as const)(
    'sends %s to the paired host and refreshes the picker',
    async (mode, method, params) => {
      const sendRequest = vi.fn().mockResolvedValue({
        ok: true,
        result: { repo: { id: 'new-repo', path: '/srv/orca', displayName: 'orca' } }
      })
      const { onCreated, onRefresh } = await mount({ sendRequest } as unknown as RpcClient)
      const input: MobileAddProjectInput = {
        ...baseInput,
        mode,
        kind: mode === 'create' ? 'folder' : 'git',
        name: ' new-app ',
        url: ' https://example.com/orca.git '
      }

      let submitted = false
      await act(async () => {
        submitted = await hook.submit(input)
      })

      expect(submitted).toBe(true)
      expect(sendRequest).toHaveBeenCalledWith(method, params, {
        failWhenDisconnected: true,
        timeoutMs: mode === 'clone' ? 600_000 : 60_000
      })
      expect(onRefresh).toHaveBeenCalledOnce()
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-repo', displayName: 'orca' })
      )
      expect(getCachedRepos('add-project-test-host')).toEqual([
        expect.objectContaining({ id: 'new-repo' })
      ])
    }
  )

  it('keeps the drawer open and surfaces the host error', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Folder does not exist on this host' }
    })
    const { onCreated, onRefresh } = await mount({ sendRequest } as unknown as RpcClient)

    await act(async () => {
      expect(await hook.submit(baseInput)).toBe(false)
    })

    expect(hook.error).toBe('Folder does not exist on this host')
    expect(onRefresh).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows a folder creation error returned inside a successful RPC response', async () => {
    const sendRequest = vi.fn().mockResolvedValue({
      ok: true,
      result: { error: 'Parent directory must be an absolute path' }
    })
    const { onCreated } = await mount({ sendRequest } as unknown as RpcClient)

    await act(async () => {
      expect(await hook.submit({ ...baseInput, mode: 'create', name: 'notes' })).toBe(false)
    })

    expect(hook.error).toBe('Parent directory must be an absolute path')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('reports a completed add even when the list refresh fails', async () => {
    const client = {
      sendRequest: vi.fn().mockResolvedValue({
        ok: true,
        result: { repo: { id: 'created-despite-refresh', path: '/srv/orca', displayName: 'orca' } }
      })
    } as unknown as RpcClient
    const onRefresh = vi.fn().mockRejectedValue(new Error('offline during refresh'))
    const { onCreated } = await mount(client, vi.fn(), onRefresh)

    await act(async () => {
      expect(await hook.submit(baseInput)).toBe(true)
    })

    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'created-despite-refresh' })
    )
    expect(hook.error).toBe('')
  })
})
