import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { MobileBacklogPanel } from './MobileBacklogPanel'

const backlog = vi.hoisted(() => ({
  state: {
    connState: 'connected',
    screenState: { kind: 'ready', snapshot: { state: 'ready', tasks: [] as unknown[] } },
    selectedTaskId: null as string | null,
    detailState: null as unknown,
    setSelectedTaskId: vi.fn(),
    refresh: vi.fn(),
    retry: vi.fn()
  }
}))

vi.mock('./use-mobile-backlog', () => ({ useMobileBacklog: () => backlog.state }))
vi.mock('../components/MobileMarkdown', () => ({
  MobileMarkdown: ({ content }: { content: string }) => createElement('Markdown', {}, content)
}))
vi.mock('react-native', async () => {
  const React = await import('react')
  return {
    ActivityIndicator: 'ActivityIndicator',
    FlatList: (props: { data: unknown[]; renderItem: (info: { item: unknown }) => unknown }) =>
      React.createElement('FlatList', {}, ...props.data.map((item) => props.renderItem({ item }))),
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    StyleSheet: { create: (styles: unknown) => styles }
  }
})
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }))
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }))
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
