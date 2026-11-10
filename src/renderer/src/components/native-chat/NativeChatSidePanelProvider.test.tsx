// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useContext, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  NativeChatMessage,
  NativeChatSubagentEntry
} from '../../../../shared/native-chat-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatSubagentEntries } from './NativeChatSubagentRun'
import { NativeChatSidePanelProvider } from './NativeChatSidePanelProvider'
import { NativeChatSidePanelToggle } from './NativeChatSidePanelToggle'
import {
  NativeChatSidePanelContext,
  type NativeChatSidePanelFeed
} from './native-chat-side-panel-context'
import {
  nativeChatSidePanelArtifacts,
  nativeChatSidePanelPlan
} from './native-chat-side-panel-findings'

vi.mock('./native-chat-image-runtime-context', () => ({
  useNativeChatImageRuntimeContext: () => null
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapability: () => false
}))

const explorer: NativeChatSubagentEntry = {
  id: 'a1',
  label: 'Explore the parser',
  state: 'working'
}
const reviewer: NativeChatSubagentEntry = {
  id: 'a2',
  label: 'Review the cache',
  state: 'completed'
}

function message(id: string, blocks: NativeChatMessage['blocks']): NativeChatMessage {
  return { id, source: 'transcript', role: 'assistant', timestamp: null, blocks }
}

const conversation: NativeChatMessage[] = [
  message('m0', [{ type: 'subagent-group', groupId: 'g', agents: [explorer, reviewer] }]),
  message('m1', [
    {
      type: 'tool-call',
      name: 'ExitPlanMode',
      input: { plan: '# Release\n\n- Run the tests' },
      state: 'completed'
    }
  ]),
  message('m2', [
    {
      type: 'text',
      text: 'Here it is:\n::orca-visual{file="chart.html" title="Latency"}\nAlso https://claude.ai/code/artifact/abc-123 and again https://claude.ai/code/artifact/abc-123.'
    }
  ])
]

/** Stands in for the chat's pieces: hands the panel what they would. */
function Publisher({ feed }: { feed: NativeChatSidePanelFeed }): null {
  const publish = useContext(NativeChatSidePanelContext)?.publish
  useEffect(() => publish?.(feed), [feed, publish])
  return null
}

function chat(feed: NativeChatSidePanelFeed): React.JSX.Element {
  return (
    <TooltipProvider>
      <NativeChatSidePanelProvider
        session={{ tabId: 't1', sessionId: 's1', agent: 'claude', target: { kind: 'local' } }}
      >
        <Publisher feed={feed} />
        <NativeChatSidePanelToggle />
        <NativeChatSubagentEntries agents={[explorer, reviewer]} />
      </NativeChatSidePanelProvider>
    </TooltipProvider>
  )
}

const row = (id: string, text: string) => ({
  message: message(id, [{ type: 'text', text }]),
  turnKey: undefined
})

describe('the panel beside a chat', () => {
  afterEach(cleanup)

  it('opens one subagent’s own rows from its row, follows them, and goes back to the list', () => {
    const view = render(
      chat({ conversation, subagentRows: new Map([['a1', [row('r1', 'Reading parser.ts')]]]) })
    )
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Explore the parser in the side panel' })
    )
    const panel = screen.getByRole('complementary')
    expect(panel.textContent).toContain('Reading parser.ts')

    // The child keeps working: its new row reaches the open panel.
    act(() => {
      view.rerender(
        chat({
          conversation,
          subagentRows: new Map([
            ['a1', [row('r1', 'Reading parser.ts'), row('r2', 'Found the bug')]]
          ])
        })
      )
    })
    expect(panel.textContent).toContain('Found the bug')

    fireEvent.click(screen.getByRole('button', { name: 'All subagents' }))
    expect(panel.textContent).toContain('Review the cache')
    expect(panel.textContent).not.toContain('Found the bug')
    // The row that opened a subagent closes the panel when pressed on the one showing.
    fireEvent.click(screen.getByRole('button', { name: 'Open Review the cache in the side panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Review the cache in the side panel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('opens from the corner button and shows the plan and the artifacts of the conversation', () => {
    render(chat({ conversation }))
    fireEvent.click(screen.getByRole('button', { name: 'Conversation panel' }))
    const panel = screen.getByRole('complementary')
    expect(panel.getAttribute('data-native-chat-side-panel')).toBe('background')

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Plan' }))
    expect(panel.textContent).toContain('Run the tests')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Artifacts' }))
    expect(panel.textContent).toContain('Latency')
    expect(panel.textContent).toContain('claude.ai/code/artifact/abc-123')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Context' }))
    expect(panel.textContent).toContain('Known once the agent has answered.')

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})

describe('what the panel reads from the conversation', () => {
  it('takes the newest plan and task list, and each artifact once', () => {
    const later = [
      ...conversation,
      message('m3', [
        {
          type: 'tool-call',
          name: 'TodoWrite',
          input: { todos: [{ content: 'Ship', status: 'in_progress', activeForm: 'Shipping' }] },
          state: 'completed'
        },
        {
          type: 'tool-call',
          name: 'ExitPlanMode',
          input: { plan: 'Second plan' },
          state: 'completed'
        }
      ])
    ]
    expect(nativeChatSidePanelPlan(later)).toEqual({
      plan: 'Second plan',
      tasks: { tasks: [{ content: 'Ship', status: 'in_progress', activeForm: 'Shipping' }] }
    })
    expect(nativeChatSidePanelArtifacts(conversation)).toEqual([
      { kind: 'visual', file: 'chart.html', title: 'Latency' },
      { kind: 'link', url: 'https://claude.ai/code/artifact/abc-123' }
    ])
  })
})
