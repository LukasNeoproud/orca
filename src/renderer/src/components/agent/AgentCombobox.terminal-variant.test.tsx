// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import type { TuiAgent } from '../../../../shared/tui-agent'
import AgentCombobox from './AgentCombobox'

afterEach(cleanup)

const chatAgents: ReadonlySet<TuiAgent> = new Set(['claude'])

describe('AgentCombobox terminal variant', () => {
  it('offers a chat-capable agent as a chat row and a terminal row', () => {
    const onValueChange = vi.fn()
    const onSelect = vi.fn()
    render(
      <AgentCombobox
        agents={AGENT_CATALOG.filter((agent) => agent.id === 'claude' || agent.id === 'pi')}
        value="pi"
        onValueChange={onValueChange}
        terminalVariant={{ agents: chatAgents, inTerminal: false, onSelect }}
      />
    )

    fireEvent.click(screen.getByRole('combobox'))
    const names = screen.getAllByRole('option').map((option) => option.textContent)
    expect(names).toEqual(['Claude (Chat)', 'Claude (Terminal)', 'Pi'])

    fireEvent.click(screen.getByRole('option', { name: 'Claude (Terminal)' }))
    expect(onSelect).toHaveBeenCalledWith('claude', true)
    expect(onValueChange).toHaveBeenCalledWith('claude')
  })

  it('names the terminal choice on the closed trigger', () => {
    render(
      <AgentCombobox
        agents={AGENT_CATALOG}
        value="claude"
        onValueChange={vi.fn()}
        terminalVariant={{ agents: chatAgents, inTerminal: true, onSelect: vi.fn() }}
      />
    )

    expect(screen.getByRole('combobox').textContent).toContain('Claude (Terminal)')
  })
})
