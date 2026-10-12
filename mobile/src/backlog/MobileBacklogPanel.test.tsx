import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileBacklogPanel } from './MobileBacklogPanel'
import { hostType } from '../test-support/host-type-predicate'

const backlog = vi.hoisted(() => ({
  state: {
    connState: 'connected',
    screenState: { kind: 'ready', snapshot: { state: 'ready', tasks: [] as unknown[] } },
    selectedTaskId: null as string | null,
    detailState: null as unknown,
    taskActionsSupported: true as boolean | null,
    setSelectedTaskId: vi.fn(),
    refresh: vi.fn(),
    retry: vi.fn()
  }
}))
const host = vi.hoisted(() => ({ client: { sendRequest: vi.fn() }, state: 'connected' }))
const filePreview = vi.hoisted(() => ({ resolve: vi.fn() }))

vi.mock('./use-mobile-backlog', () => ({ useMobileBacklog: () => backlog.state }))
vi.mock('./MobileBacklogTaskAction', () => ({
  MobileBacklogTaskAction: () => createElement('MobileBacklogTaskAction')
}))
vi.mock('../transport/client-context', () => ({ useHostClient: () => host }))
vi.mock('../files/mobile-contextual-file-preview', () => ({
  resolveMobileContextualFilePreview: filePreview.resolve
}))
vi.mock('../session/MobileLinkActionSheet', () => ({
  MobileLinkActionSheet: (props: { target: unknown }) =>
    createElement('MobileLinkActionSheet', props)
}))
vi.mock('../components/MobileMarkdown', () => ({
  MobileMarkdown: (props: { content: string }) => createElement('Markdown', props, props.content)
}))
vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    ActivityIndicator: 'ActivityIndicator',
    FlatList: (props: { data: unknown[]; renderItem: (info: { item: unknown }) => ReactNode }) =>
      React.createElement('FlatList', {}, ...props.data.map((item) => props.renderItem({ item }))),
    Pressable: 'Pressable',
    Linking: { openURL: vi.fn().mockResolvedValue(undefined) },
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    StyleSheet: { create: (styles: unknown) => styles }
  }
})
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }))
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn().mockResolvedValue(undefined) }))
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  ChevronLeft: 'ChevronLeft',
  RefreshCw: 'RefreshCw'
}))

async function renderPanel(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer
  await act(async () => {
    renderer = create(
      createElement(MobileBacklogPanel, {
        hostId: 'host',
        worktreeId: 'folder:workspace',
        name: 'Workspace'
      })
    )
  })
  return renderer
}

describe('MobileBacklogPanel', () => {
  it('shows the workspace task list and opens task detail', async () => {
    backlog.state.screenState = {
      kind: 'ready',
      snapshot: {
        state: 'ready',
        tasks: [{ id: 'TASK-2', title: 'Open terminal', status: 'To Do', priority: 'High' }]
      }
    }
    backlog.state.selectedTaskId = null
    const renderer = await renderPanel()
    expect(JSON.stringify(renderer.toJSON())).toContain('Open terminal')
    const row = renderer.root.findByProps({ accessibilityLabel: 'TASK-2: Open terminal' })
    await act(async () => row.props.onPress())
    expect(backlog.state.setSelectedTaskId).toHaveBeenCalledWith('TASK-2')
    await act(async () => renderer.unmount())
  })

  it('renders Markdown details and checked criteria', async () => {
    backlog.state.selectedTaskId = 'TASK-2'
    backlog.state.detailState = {
      kind: 'ready',
      task: {
        id: 'TASK-2',
        title: 'Open terminal',
        status: 'To Do',
        priority: 'High',
        description: '**Detail**',
        acceptanceCriteria: [{ index: 1, text: 'Terminal opens', checked: true }]
      }
    }
    const renderer = await renderPanel()
    const output = JSON.stringify(renderer.toJSON())
    expect(output).toContain('**Detail**')
    expect(output).toContain('Terminal opens')
    expect(output).toContain('Check')
    const markdown = renderer.root.findAll(hostType('Markdown'))
    await act(async () =>
      markdown[0]!.props.onShowLinkActions({ kind: 'web', url: 'https://example.com' })
    )
    expect(renderer.root.find(hostType('MobileLinkActionSheet')).props).toMatchObject({
      target: { source: 'chat', kind: 'web', url: 'https://example.com' },
      worktreeId: 'folder:workspace',
      showAddToMessage: false
    })
    await act(async () => renderer.unmount())
  })

  it('requires a separate action before opening an outside-workspace file', async () => {
    backlog.state.selectedTaskId = 'TASK-2'
    filePreview.resolve.mockResolvedValue({
      status: 'resolved',
      outsideWorkspace: true,
      displayPath: '/tmp/example.ts',
      line: null,
      source: {
        source: 'terminalArtifact',
        worktreeId: 'folder:workspace',
        absolutePath: '/tmp/example.ts',
        grantId: 'grant',
        pathText: '/tmp/example.ts'
      }
    })
    const renderer = await renderPanel()
    await act(async () =>
      renderer.root.findAll(hostType('Markdown'))[0]!.props.onOpenFile('/tmp/example.ts')
    )
    expect(renderer.root.find(hostType('MobileLinkActionSheet')).props.target).toMatchObject({
      kind: 'file',
      pathText: '/tmp/example.ts'
    })
    await act(async () => renderer.unmount())
  })

  it('distinguishes an unsupported host from an empty Backlog', async () => {
    backlog.state.selectedTaskId = null
    backlog.state.screenState = { kind: 'unsupported' } as typeof backlog.state.screenState
    const unsupported = await renderPanel()
    expect(JSON.stringify(unsupported.toJSON())).toContain('Host update required')
    await act(async () => unsupported.unmount())
    backlog.state.screenState = { kind: 'ready', snapshot: { state: 'ready', tasks: [] } }
    const empty = await renderPanel()
    expect(JSON.stringify(empty.toJSON())).toContain('No Backlog tasks')
    await act(async () => empty.unmount())
  })
})
