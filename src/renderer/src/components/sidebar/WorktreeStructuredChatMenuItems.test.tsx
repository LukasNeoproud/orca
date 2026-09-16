// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  support: { claude: true, codex: true },
  detectedIds: ['claude', 'codex', 'gemini'] as string[]
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: React.ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  )
}))

vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => ({ kind: 'local' })
}))

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: mocks.detectedIds })
}))

vi.mock('@/components/native-chat/use-structured-agent-launch-support', () => ({
  useStructuredAgentLaunchSupport: () => mocks.support
}))

vi.mock('@/lib/structured-agent-session-launch', () => ({
  startStructuredAgentLaunch: mocks.launch,
  useStructuredAgentLaunchStatus: () => 'idle'
}))

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: ({ agent }: { agent: string }) => <span data-agent-icon={agent} />
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: object) => unknown) =>
    selector({ settings: { disabledTuiAgents: [] } })
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replace(`{{${key}}}`, value),
      fallback
    )
}))

import { WorktreeStructuredChatMenuItems } from './WorktreeStructuredChatMenuItems'

beforeEach(() => {
  mocks.support.claude = true
  mocks.support.codex = true
  mocks.detectedIds = ['claude', 'codex', 'gemini']
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WorktreeStructuredChatMenuItems', () => {
  it('offers direct supported-provider actions for a workspace', () => {
    render(<WorktreeStructuredChatMenuItems worktreeId="worktree-1" disabled={false} />)

    expect(screen.getByText('New Claude Chat')).toBeTruthy()
    fireEvent.click(screen.getByText('New Codex Chat'))

    expect(mocks.launch).toHaveBeenCalledWith('worktree-1', 'codex')
  })

  it('omits providers that the workspace host does not support', () => {
    mocks.support.codex = false
    render(<WorktreeStructuredChatMenuItems worktreeId="worktree-1" disabled={false} />)

    expect(screen.getByText('New Claude Chat')).toBeTruthy()
    expect(screen.queryByText('New Codex Chat')).toBeNull()
  })
})
