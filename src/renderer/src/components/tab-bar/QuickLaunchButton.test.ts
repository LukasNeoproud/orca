// @vitest-environment happy-dom

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickLaunchAgentMenuItems, shouldShowLaunchWatchdogTimeout } from './QuickLaunchButton'

const {
  shortcutLabelMock,
  storeState,
  openSettingsPageMock,
  openSettingsTargetMock,
  useDetectedAgentsMock,
  startStructuredAgentLaunchMock
} = vi.hoisted(() => ({
  shortcutLabelMock: vi.fn<() => string | null>(),
  storeState: {
    settings: {
      defaultTuiAgent: 'codex' as 'claude' | 'codex' | 'gemini' | 'blank' | null,
      disabledTuiAgents: [] as string[],
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: false
    },
    activeRepoId: null,
    activeWorktreeId: 'worktree-1',
    projects: [] as unknown[],
    worktreesByRepo: {} as Record<string, unknown[]>,
    repos: [] as unknown[],
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn()
  },
  openSettingsPageMock: vi.fn(),
  openSettingsTargetMock: vi.fn(),
  useDetectedAgentsMock: vi.fn(() => ({ detectedIds: ['claude', 'codex', 'gemini'] })),
  startStructuredAgentLaunchMock: vi.fn()
}))

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: useDetectedAgentsMock
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useOptionalShortcutLabel: shortcutLabelMock
}))

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => {
      return selector(storeState)
    },
    {
      getState: () => storeState
    }
  )

  return { useAppStore }
})

vi.mock('@/lib/agent-catalog', async () => {
  const ReactActual = (await vi.importActual('react')) as {
    createElement: typeof React.createElement
  }

  return {
    getAgentCatalog: () => [
      { id: 'claude', label: 'Claude' },
      { id: 'codex', label: 'Codex' },
      { id: 'gemini', label: 'Gemini' }
    ],
    AgentIcon: ({ agent }: { agent: string }) => ReactActual.createElement('span', null, agent)
  }
})

vi.mock('@/components/ui/dropdown-menu', async () => {
  const ReactActual = (await vi.importActual('react')) as {
    createElement: typeof React.createElement
  }

  return {
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children: React.ReactNode
      onSelect?: () => void
    }) => ReactActual.createElement('div', { ...props, onClick: onSelect }, children),
    DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('span', { 'data-dropdown-shortcut': 'true' }, children),
    DropdownMenuSeparator: () => ReactActual.createElement('hr')
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replace(`{{${key}}}`, value),
      fallback
    )
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn()
  }
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: vi.fn()
}))

vi.mock('@/runtime/local-runtime-capabilities', () => ({
  readLocalRuntimeCapabilitiesOrUnknown: () => ['agent-session.structured.v1']
}))

vi.mock('@/lib/structured-agent-session-launch', () => ({
  startStructuredAgentLaunch: startStructuredAgentLaunchMock,
  useStructuredAgentLaunchStatus: () => 'idle'
}))

function renderAgentMenuItems(): string {
  return renderToStaticMarkup(
    React.createElement(QuickLaunchAgentMenuItems, {
      worktreeId: 'worktree-1',
      groupId: 'group-1',
      onFocusTerminal: vi.fn()
    })
  )
}

function rowMarkup(html: string, label: string): string {
  const start = html.indexOf(`title="Launch ${label} in a new terminal"`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = html.indexOf('</div>', start)
  expect(end).toBeGreaterThan(start)

  return html.slice(start, end)
}

beforeEach(() => {
  shortcutLabelMock.mockReset()
  shortcutLabelMock.mockReturnValue(null)
  useDetectedAgentsMock.mockClear()
  openSettingsPageMock.mockReset()
  openSettingsTargetMock.mockReset()
  storeState.settings.defaultTuiAgent = 'codex'
  storeState.settings.disabledTuiAgents = []
  storeState.worktreesByRepo = {}
  storeState.repos = []
  storeState.openSettingsPage = openSettingsPageMock
  storeState.openSettingsTarget = openSettingsTargetMock
})

afterEach(cleanup)

describe('QuickLaunchAgentMenuItems', () => {
  it('renders the new-agent shortcut next to the configured default agent only', () => {
    shortcutLabelMock.mockReturnValue('⌘⌥T')

    const html = renderAgentMenuItems()

    expect(html.match(/data-dropdown-shortcut="true"/g) ?? []).toHaveLength(1)
    expect(rowMarkup(html, 'Codex')).toContain('⌘⌥T')
    expect(rowMarkup(html, 'Claude')).not.toContain('⌘⌥T')
    expect(rowMarkup(html, 'Gemini')).not.toContain('⌘⌥T')
  })

  it('hides the default-agent shortcut when the action is unbound', () => {
    shortcutLabelMock.mockReturnValue(null)

    const html = renderAgentMenuItems()

    expect(html).not.toContain('data-dropdown-shortcut="true"')
  })

  it('routes agent detection to the worktree-owning runtime host, not the local client', () => {
    // Repro for the "Remote Server lists local agents" bug: a worktree owned by
    // a paired runtime must probe that runtime, never the client's PATH.
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1', hostId: 'runtime:env-1' }]
    }
    storeState.repos = [{ id: 'repo-1' }]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'runtime',
      environmentId: 'env-1'
    })
  })

  it('prefers the paired runtime owner over its server-side SSH connection', () => {
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1' }]
    }
    storeState.repos = [
      {
        id: 'repo-1',
        connectionId: 'server-only-ssh-target',
        executionHostId: 'runtime:env-1'
      }
    ]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'runtime',
      environmentId: 'env-1'
    })
  })

  it('routes agent detection to the owning SSH host', () => {
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1' }]
    }
    storeState.repos = [{ id: 'repo-1', connectionId: 'ssh-target-1' }]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'ssh',
      connectionId: 'ssh-target-1'
    })
  })

  it('does not label an auto-picked or blank default as configured', () => {
    shortcutLabelMock.mockReturnValue('⌘⌥T')

    storeState.settings.defaultTuiAgent = null
    expect(renderAgentMenuItems()).not.toContain('data-dropdown-shortcut="true"')

    storeState.settings.defaultTuiAgent = 'blank'
    expect(renderAgentMenuItems()).not.toContain('data-dropdown-shortcut="true"')
  })

  it('lists explicit structured chat actions separately from terminal launches', () => {
    const html = renderAgentMenuItems()

    expect(html).toContain('New Claude Chat')
    expect(html).toContain('New Codex Chat')
    expect(html).toContain('Launch Claude in a new terminal')
    expect(html).toContain('Launch Codex in a new terminal')
    expect(html).not.toContain('New Gemini Chat')
  })

  it('starts an explicit structured chat without invoking the terminal launcher', async () => {
    const { launchAgentInNewTab } = await import('@/lib/launch-agent-in-new-tab')
    render(
      React.createElement(QuickLaunchAgentMenuItems, {
        worktreeId: 'worktree-1',
        groupId: 'group-1',
        onFocusTerminal: vi.fn()
      })
    )

    fireEvent.click(screen.getByText('New Codex Chat'))

    expect(startStructuredAgentLaunchMock).toHaveBeenCalledWith('worktree-1', 'codex')
    expect(launchAgentInNewTab).not.toHaveBeenCalled()
  })

  it('forwards review-note prompts through an explicit structured chat action', () => {
    const onPromptDelivered = vi.fn()
    render(
      React.createElement(QuickLaunchAgentMenuItems, {
        worktreeId: 'worktree-1',
        groupId: 'group-1',
        onFocusTerminal: vi.fn(),
        prompt: 'Review these notes',
        promptDelivery: 'submit-after-ready',
        onPromptDelivered
      })
    )

    fireEvent.click(screen.getByText('New Claude Chat'))

    expect(startStructuredAgentLaunchMock).toHaveBeenCalledWith('worktree-1', 'claude', {
      prompt: 'Review these notes',
      promptDelivery: 'submit-after-ready',
      onPromptDelivered
    })
  })

  it('does not offer structured chat for a prompt that must remain an editable draft', () => {
    render(
      React.createElement(QuickLaunchAgentMenuItems, {
        worktreeId: 'worktree-1',
        groupId: 'group-1',
        onFocusTerminal: vi.fn(),
        prompt: 'Keep this editable',
        promptDelivery: 'draft'
      })
    )

    expect(screen.queryByText('New Codex Chat')).toBeNull()
    expect(screen.queryByText('New Claude Chat')).toBeNull()
  })
})

describe('shouldShowLaunchWatchdogTimeout', () => {
  it('does not report slow agent readiness once a PTY exists', () => {
    expect(
      shouldShowLaunchWatchdogTimeout({
        hasPty: true
      })
    ).toBe(false)
  })

  it('reports launches where no PTY appeared', () => {
    expect(
      shouldShowLaunchWatchdogTimeout({
        hasPty: false
      })
    ).toBe(true)
  })
})
