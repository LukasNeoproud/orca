import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { buildMobileRunTargetSetupHosts, MobileRunTargetSetup } from './MobileRunTargetSetup'
import { hostType } from '../test-support/host-type-predicate'

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}))
vi.mock('./BottomDrawer', () => ({ BottomDrawer: 'BottomDrawer' }))

const repo = {
  id: 'source-repo',
  displayName: 'orca',
  path: '/source/orca',
  kind: 'git' as const,
  upstream: { owner: 'team', repo: 'orca' }
}

function success(result: unknown) {
  return { id: 'request', ok: true as const, result, _meta: { runtimeId: 'runtime' } }
}

async function render(client: RpcClient): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      createElement(MobileRunTargetSetup, {
        client,
        selectedRepo: repo,
        visible: true,
        onClose: vi.fn(),
        onReady: vi.fn()
      })
    )
  })
  return renderer
}

describe('MobileRunTargetSetup', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('excludes hosts already configured and runtime-owned SSH targets', () => {
    expect(
      buildMobileRunTargetSetupHosts(
        [
          { id: 'ssh server', label: 'Server', connected: true },
          { id: 'runtime-ssh-hidden', label: 'Hidden', connected: true },
          { id: 'offline', label: 'Offline', connected: false }
        ],
        new Set(['local']),
        'darwin'
      )
    ).toEqual([
      { id: 'ssh:ssh%20server', label: 'SSH · Server', connected: true },
      { id: 'ssh:offline', label: 'SSH · Offline', connected: false }
    ])
  })

  it('gates old hosts before reading targets or submitting', async () => {
    const sendRequest = vi.fn().mockResolvedValue(success({ capabilities: [] }))
    renderer = await render({ sendRequest } as unknown as RpcClient)

    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(sendRequest).toHaveBeenCalledWith('status.get')
    expect(
      renderer.root
        .findAll(hostType('Text'))
        .some((node) => node.children.includes('Update Orca on this host to set up projects.'))
    ).toBe(true)
  })

  it('requires the host-local linking capability before setting up a folder on another host', async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValue(success({ capabilities: ['project-host-setup.v1'] }))
    await act(async () => {
      renderer = create(
        createElement(MobileRunTargetSetup, {
          client: { sendRequest } as unknown as RpcClient,
          selectedRepo: { id: 'folder-repo', displayName: 'Notes', path: '/notes', kind: 'folder' },
          visible: true,
          onClose: vi.fn(),
          onReady: vi.fn()
        })
      )
    })

    expect(sendRequest).toHaveBeenCalledExactlyOnceWith('status.get')
    expect(
      renderer!.root
        .findAll(hostType('Text'))
        .some((node) =>
          node.children.includes(
            'Update Orca on this host to set up folder projects and projects without a Git remote on another host.'
          )
        )
    ).toBe(true)
    expect(renderer!.root.findByProps({ accessibilityRole: 'button' }).props.disabled).toBe(true)
  })

  it('sets up a folder project on SSH when the host supports durable linking', async () => {
    const onReady = vi.fn()
    const sendRequest = vi.fn().mockImplementation((method: string) => {
      if (method === 'status.get') {
        return Promise.resolve(
          success({
            capabilities: ['project-host-setup.v1', 'project-host-setup.host-local-link.v1']
          })
        )
      }
      if (method === 'ssh.listTargetSummaries') {
        return Promise.resolve(
          success({ targets: [{ id: 'server', label: 'Server', connected: true }] })
        )
      }
      if (method === 'projectHostSetup.list') {
        return Promise.resolve(
          success({ setups: [{ projectId: 'repo:folder-repo', hostId: 'local' }] })
        )
      }
      if (method === 'projectHostSetup.setupExistingFolder') {
        return Promise.resolve(success({ result: { repo: { id: 'remote-folder' } } }))
      }
      throw new Error(`Unexpected RPC: ${method}`)
    })
    await act(async () => {
      renderer = create(
        createElement(MobileRunTargetSetup, {
          client: { sendRequest } as unknown as RpcClient,
          selectedRepo: { id: 'folder-repo', displayName: 'Notes', path: '/notes', kind: 'folder' },
          visible: true,
          onClose: vi.fn(),
          onReady
        })
      )
    })
    const host = renderer!.root
      .findAll(hostType('Pressable'))
      .find(
        (node) =>
          node.props.accessibilityRole === 'radio' &&
          node.props.children[0].props.children === 'SSH · Server'
      )
    await act(async () => host!.props.onPress())
    await act(async () =>
      renderer!.root
        .findByProps({ accessibilityLabel: 'Project path on host' })
        .props.onChangeText('/srv/notes')
    )
    const submit = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'button')
    await act(async () => submit!.props.onPress())
    expect(sendRequest).toHaveBeenCalledWith(
      'projectHostSetup.setupExistingFolder',
      expect.objectContaining({
        projectId: 'repo:folder-repo',
        hostId: 'ssh:server',
        path: '/srv/notes',
        kind: 'folder'
      }),
      expect.any(Object)
    )
    expect(onReady).toHaveBeenCalledWith('remote-folder')
  })

  it('imports an existing checkout on a connected SSH host with project identity', async () => {
    const onReady = vi.fn()
    const sendRequest = vi.fn().mockImplementation((method: string) => {
      switch (method) {
        case 'status.get':
          return Promise.resolve(success({ capabilities: ['project-host-setup.v1'] }))
        case 'ssh.listTargetSummaries':
          return Promise.resolve(
            success({ targets: [{ id: 'server', label: 'Server', connected: true }] })
          )
        case 'projectHostSetup.list':
          return Promise.resolve(
            success({ setups: [{ projectId: 'github:team/orca', hostId: 'local' }] })
          )
        case 'projectHostSetup.setupExistingFolder':
          return Promise.resolve(success({ result: { repo: { id: 'remote-repo' } } }))
        default:
          throw new Error(`Unexpected RPC: ${method}`)
      }
    })
    const client = { sendRequest } as unknown as RpcClient
    await act(async () => {
      renderer = create(
        createElement(MobileRunTargetSetup, {
          client,
          selectedRepo: repo,
          visible: true,
          onClose: vi.fn(),
          onReady
        })
      )
    })

    const host = renderer!.root
      .findAll(hostType('Pressable'))
      .find(
        (node) =>
          node.props.accessibilityRole === 'radio' &&
          node.props.children[0].props.children === 'SSH · Server'
      )
    expect(host).toBeDefined()
    await act(async () => host!.props.onPress())
    const path = renderer!.root.findByProps({ accessibilityLabel: 'Project path on host' })
    await act(async () => path.props.onChangeText('/srv/orca'))
    const submit = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'button')
    await act(async () => submit!.props.onPress())

    expect(sendRequest).toHaveBeenCalledWith(
      'projectHostSetup.setupExistingFolder',
      {
        projectId: 'github:team/orca',
        projectProviderIdentity: { provider: 'github', owner: 'team', repo: 'orca' },
        hostId: 'ssh:server',
        displayName: 'orca',
        path: '/srv/orca',
        kind: 'git'
      },
      { timeoutMs: 60_000, failWhenDisconnected: true }
    )
    expect(onReady).toHaveBeenCalledWith('remote-repo')
  })

  it('offers clone on the local host for a Git project based on SSH', async () => {
    const sendRequest = vi.fn().mockImplementation((method: string) => {
      switch (method) {
        case 'status.get':
          return Promise.resolve(success({ capabilities: ['project-host-setup.v1'] }))
        case 'ssh.listTargetSummaries':
          return Promise.resolve(
            success({ targets: [{ id: 'server', label: 'Server', connected: true }] })
          )
        case 'projectHostSetup.list':
          return Promise.resolve(
            success({ setups: [{ projectId: 'github:team/orca', hostId: 'ssh:server' }] })
          )
        case 'projectHostSetup.clone':
          return Promise.resolve(success({ result: { repo: { id: 'local-repo' } } }))
        default:
          throw new Error(`Unexpected RPC: ${method}`)
      }
    })
    const client = { sendRequest } as unknown as RpcClient
    await act(async () => {
      renderer = create(
        createElement(MobileRunTargetSetup, {
          client,
          selectedRepo: { ...repo, connectionId: 'server' },
          visible: true,
          onClose: vi.fn(),
          onReady: vi.fn()
        })
      )
    })

    const local = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'radio')
    await act(async () => local!.props.onPress())
    const clone = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.children?.props?.children === 'Clone from URL')
    await act(async () => clone!.props.onPress())
    await act(async () =>
      renderer!.root
        .findByProps({ accessibilityLabel: 'Repository URL' })
        .props.onChangeText('https://github.com/team/orca.git')
    )
    await act(async () =>
      renderer!.root
        .findByProps({ accessibilityLabel: 'Clone destination' })
        .props.onChangeText('/work/orca')
    )
    const submit = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'button')
    await act(async () => submit!.props.onPress())

    expect(sendRequest).toHaveBeenCalledWith(
      'projectHostSetup.clone',
      {
        projectId: 'github:team/orca',
        projectProviderIdentity: { provider: 'github', owner: 'team', repo: 'orca' },
        hostId: 'local',
        displayName: 'orca',
        url: 'https://github.com/team/orca.git',
        destination: '/work/orca'
      },
      { timeoutMs: 600_000, failWhenDisconnected: true }
    )
  })

  it('keeps the drawer open and shows a refresh failure from onReady', async () => {
    const sendRequest = vi.fn().mockImplementation((method: string) => {
      switch (method) {
        case 'status.get':
          return Promise.resolve(success({ capabilities: ['project-host-setup.v1'] }))
        case 'ssh.listTargetSummaries':
          return Promise.resolve(success({ targets: [] }))
        case 'projectHostSetup.list':
          return Promise.resolve(success({ setups: [] }))
        case 'projectHostSetup.setupExistingFolder':
          return Promise.resolve(success({ result: { repo: { id: 'local-repo' } } }))
        default:
          throw new Error(`Unexpected RPC: ${method}`)
      }
    })
    const client = { sendRequest } as unknown as RpcClient
    await act(async () => {
      renderer = create(
        createElement(MobileRunTargetSetup, {
          client,
          selectedRepo: repo,
          visible: true,
          onClose: vi.fn(),
          onReady: vi.fn().mockRejectedValue(new Error('Could not refresh projects'))
        })
      )
    })

    const host = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'radio')
    await act(async () => host!.props.onPress())
    const path = renderer!.root.findByProps({ accessibilityLabel: 'Project path on host' })
    await act(async () => path.props.onChangeText('/work/orca'))
    const submit = renderer!.root
      .findAll(hostType('Pressable'))
      .find((node) => node.props.accessibilityRole === 'button')
    await act(async () => submit!.props.onPress())

    expect(
      renderer!.root
        .findAll(hostType('Text'))
        .some((node) => node.children.includes('Could not refresh projects'))
    ).toBe(true)
  })
})
