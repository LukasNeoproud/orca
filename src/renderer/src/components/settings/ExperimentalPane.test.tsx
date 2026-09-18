// @vitest-environment happy-dom

import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getDefaultSettings } from '../../../../shared/constants'
import { ExperimentalPane } from './ExperimentalPane'
import { getExperimentalPaneSearchEntries } from './experimental-search'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

vi.mock('./EphemeralVmsPane', () => ({
  EphemeralVmsPane: () => <div data-testid="ephemeral-vms-pane">Cloud VM pane</div>
}))

vi.mock('../ui/select', async () => {
  const React = await import('react')

  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void
  }>({})

  return {
    Select: ({
      value,
      onValueChange,
      children
    }: {
      value: string
      onValueChange: (value: string) => void
      children: React.ReactNode
    }) => {
      const contextValue = React.useMemo(() => ({ onValueChange }), [onValueChange])
      return (
        <SelectContext.Provider value={contextValue}>
          <div data-testid="native-chat-default-view-select" data-value={value}>
            {children}
          </div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'button'> & { size?: string }) => (
      <button type="button" data-slot="select-trigger" {...props}>
        {children}
      </button>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="select-content">{children}</div>
    ),
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectContext)
      return (
        <button
          type="button"
          data-slot="select-item"
          data-value={value}
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      )
    }
  }
})

afterEach(() => {
  document.body.innerHTML = ''
})

async function renderExperimentalPane(args: {
  updateSettings: (settings: Partial<GlobalSettings>) => void
  settings?: GlobalSettings
}): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <ExperimentalPane
        settings={args.settings ?? getDefaultSettings('/tmp')}
        updateSettings={args.updateSettings}
      />
    )
  })
  return { root, container }
}

describe('ExperimentalPane', () => {
  it('does not render compact worktree cards after graduation from Experimental', () => {
    const markup = renderToStaticMarkup(
      <ExperimentalPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />
    )

    expect(markup).not.toContain('Compact worktree cards')
    expect(getExperimentalPaneSearchEntries().map((entry) => entry.title)).not.toContain(
      'Compact worktree cards'
    )
  })

  it('renders agent sleep as an off-by-default searchable experimental switch', () => {
    const settings = getDefaultSettings('/tmp')
    const markup = renderToStaticMarkup(
      <ExperimentalPane settings={settings} updateSettings={vi.fn()} />
    )

    expect(settings.experimentalAgentHibernation).toBe(false)
    expect(settings.agentHibernationIdleMs).toBe(30 * 60 * 1000)
    expect(markup).toContain('Agent sleep')
    expect(markup).toContain('Manually started agents may resume')
    expect(markup).not.toContain('Sleep after')
    expect(markup).toContain('aria-checked="false"')
    expect(getExperimentalPaneSearchEntries().map((entry) => entry.title)).toContain('Agent sleep')
  })

  it('renders new card style as an off-by-default searchable experimental switch', () => {
    const settings = getDefaultSettings('/tmp')
    const markup = renderToStaticMarkup(
      <ExperimentalPane settings={settings} updateSettings={vi.fn()} />
    )

    expect(settings.experimentalNewWorktreeCardStyle).toBe(false)
    expect(markup).toContain('New card style')
    expect(markup).toContain('aria-checked="false"')
    expect(getExperimentalPaneSearchEntries().map((entry) => entry.title)).toContain(
      'New card style'
    )
  })

  it('renders the agent dashboard as an off-by-default searchable experiment', () => {
    const settings = getDefaultSettings('/tmp')
    const markup = renderToStaticMarkup(
      <ExperimentalPane settings={settings} updateSettings={vi.fn()} />
    )

    expect(settings.experimentalAgentDashboardPopout).toBeUndefined()
    expect(markup).toContain('Agent Dashboard')
    expect(markup).toContain('Monitor agents that need you, are working, or are done')
    expect(getExperimentalPaneSearchEntries().map((entry) => entry.title)).toContain(
      'Agent Dashboard'
    )
  })

  it('enables the agent dashboard through its experimental switch', async () => {
    const updateSettings = vi.fn()
    const { root, container } = await renderExperimentalPane({ updateSettings })
    const switchButton = container.querySelector<HTMLButtonElement>(
      '#experimental-agent-dashboard button[role="switch"]'
    )
    if (!switchButton) {
      throw new Error('Agent Dashboard switch was not rendered')
    }

    await act(async () => {
      switchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ experimentalAgentDashboardPopout: true })
    root.unmount()
  })

  it('keeps idle-agent visibility out of global settings', () => {
    const markup = renderToStaticMarkup(
      <ExperimentalPane
        settings={{ ...getDefaultSettings('/tmp'), experimentalAgentDashboardPopout: true }}
        updateSettings={vi.fn()}
      />
    )

    expect(markup).not.toContain('Show idle agents')
  })

  it('renders Cloud VM as an off-by-default experimental subsection', () => {
    const settings = getDefaultSettings('/tmp')
    const markup = renderToStaticMarkup(
      <ExperimentalPane settings={settings} updateSettings={vi.fn()} />
    )
    const entry = getExperimentalPaneSearchEntries().find(
      (searchEntry) => searchEntry.title === 'Cloud VM'
    )

    expect(settings.experimentalEphemeralVms).toBe(false)
    expect(markup).toContain('Cloud VM')
    expect(markup).toContain('aria-checked="false"')
    expect(markup).not.toContain('Cloud VM pane')
    expect(entry?.targetSectionId).toBe('ephemeral-vms')
  })

  it('enables Cloud VM through the experimental switch', async () => {
    const updateSettings = vi.fn()
    const { root, container } = await renderExperimentalPane({ updateSettings })

    const switchButton = container.querySelector<HTMLButtonElement>(
      '#ephemeral-vms button[role="switch"]'
    )
    if (!switchButton) {
      throw new Error('Cloud VM switch was not rendered')
    }

    await act(async () => {
      switchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ experimentalEphemeralVms: true })
    root.unmount()
  })

  it('shows Cloud VM setup controls when enabled', () => {
    const markup = renderToStaticMarkup(
      <ExperimentalPane
        settings={{ ...getDefaultSettings('/tmp'), experimentalEphemeralVms: true }}
        updateSettings={vi.fn()}
      />
    )

    expect(markup).toContain('Cloud VM pane')
    expect(markup).toContain('aria-checked="true"')
  })

  it('shows the structured-native-chat child setting with either default view', async () => {
    const updateSettings = vi.fn()
    const disabledSettings = getDefaultSettings('/tmp')
    const disabledMarkup = renderToStaticMarkup(
      <ExperimentalPane settings={disabledSettings} updateSettings={vi.fn()} />
    )
    expect(disabledMarkup).toContain('Chat UI')
    expect(disabledMarkup).not.toContain('Enable Codex and Claude chats')
    expect(disabledMarkup).not.toContain('Default view')
    expect(disabledMarkup).toContain('Session history default')

    const terminalDefault = {
      ...getDefaultSettings('/tmp'),
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: false,
      openAgentTabsInChatByDefault: false
    }
    const terminalRender = await renderExperimentalPane({
      updateSettings,
      settings: terminalDefault
    })

    // The default-view control is a sibling of the Chat UI toggle, never replaced by the opt-in.
    expect(terminalRender.container.textContent).toContain('Default view')
    expect(
      terminalRender.container.querySelector('[data-testid="native-chat-default-view-select"]')
    ).not.toBeNull()
    expect(terminalRender.container.textContent).toContain('Enable Codex and Claude chats')
    terminalRender.root.unmount()

    const { root, container } = await renderExperimentalPane({
      updateSettings,
      settings: { ...terminalDefault, openAgentTabsInChatByDefault: true }
    })

    expect(container.textContent).toContain('Enable Codex and Claude chats')
    // The one opt-in gates both providers, so its copy must not name only Codex.
    expect(container.textContent).toContain(
      'Use dedicated chats for supported Codex and Claude sessions.'
    )
    expect(container.textContent).toContain(
      'Available for local sessions. WSL, remote hosts, and unsupported Windows environments cannot open Chat UI.'
    )
    expect(container.textContent).toContain('Default view')
    root.unmount()
  })

  it('keeps the structured opt-in available when switching the default to Terminal chat', async () => {
    const updateSettings = vi.fn()
    const settings = {
      ...getDefaultSettings('/tmp'),
      experimentalNativeChat: true,
      experimentalStructuredNativeChat: true,
      openAgentTabsInChatByDefault: true
    }
    const { root, container } = await renderExperimentalPane({ updateSettings, settings })

    expect(container.textContent).toContain('Enable Codex and Claude chats')

    const terminalChatOption = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
    ).find((button) => button.getAttribute('data-value') === 'terminal-chat')
    if (!terminalChatOption) {
      throw new Error('Terminal chat default-view option was not rendered')
    }

    await act(async () => {
      terminalChatOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The two settings remain independent.
    expect(updateSettings).toHaveBeenCalledWith({ openAgentTabsInChatByDefault: false })
    expect(updateSettings).toHaveBeenCalledTimes(1)
    root.unmount()

    const terminalDefault = await renderExperimentalPane({
      updateSettings,
      settings: { ...settings, openAgentTabsInChatByDefault: false }
    })

    expect(terminalDefault.container.textContent).toContain('Enable Codex and Claude chats')
    expect(
      terminalDefault.container
        .querySelector('[aria-label="Toggle updated structured native chat"]')
        ?.getAttribute('aria-checked')
    ).toBe('true')
    terminalDefault.root.unmount()

    // Returning to Chat UI restores the control still switched on.
    const restored = await renderExperimentalPane({ updateSettings, settings })
    const structuredSwitch = restored.container.querySelector<HTMLButtonElement>(
      '#experimental-native-chat button[role="switch"][aria-label="Toggle updated structured native chat"]'
    )
    expect(structuredSwitch?.getAttribute('aria-checked')).toBe('true')
    restored.root.unmount()
  })

  it('shows Chat UI default-mode as a child setting only when Chat UI is enabled', async () => {
    const updateSettings = vi.fn()
    const disabledSettings = getDefaultSettings('/tmp')
    const disabledMarkup = renderToStaticMarkup(
      <ExperimentalPane settings={disabledSettings} updateSettings={vi.fn()} />
    )
    expect(disabledMarkup).toContain('Chat UI')
    expect(disabledMarkup).not.toContain('Default view')
    expect(disabledMarkup).toContain('Session history default')

    const settings = {
      ...getDefaultSettings('/tmp'),
      experimentalNativeChat: true,
      openAgentTabsInChatByDefault: false
    }
    const { root, container } = await renderExperimentalPane({ updateSettings, settings })

    expect(container.textContent).toContain('Default view')
    expect(container.textContent).toContain('Terminal chat')
    expect(container.textContent).toContain('Chat UI')
    expect(
      container
        .querySelector('[data-testid="native-chat-default-view-select"]')
        ?.getAttribute('data-value')
    ).toBe('terminal-chat')

    const nativeChatOption = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
    ).find((button) => button.getAttribute('data-value') === 'native-chat')
    if (!nativeChatOption) {
      throw new Error('Chat UI default-view option was not rendered')
    }

    await act(async () => {
      nativeChatOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ openAgentTabsInChatByDefault: true })

    root.unmount()

    const nativeSettings = {
      ...settings,
      openAgentTabsInChatByDefault: true
    }
    const secondRender = await renderExperimentalPane({
      updateSettings,
      settings: nativeSettings
    })

    expect(
      secondRender.container
        .querySelector('[data-testid="native-chat-default-view-select"]')
        ?.getAttribute('data-value')
    ).toBe('native-chat')

    const terminalChatOption = Array.from(
      secondRender.container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
    ).find((button) => button.getAttribute('data-value') === 'terminal-chat')
    if (!terminalChatOption) {
      throw new Error('Terminal chat default-view option was not rendered')
    }

    await act(async () => {
      terminalChatOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ openAgentTabsInChatByDefault: false })

    secondRender.root.unmount()
  })

  it('keeps the session-history default independent from the new-tab default', async () => {
    const updateSettings = vi.fn()
    const settings = {
      ...getDefaultSettings('/tmp'),
      experimentalNativeChat: false,
      openAgentTabsInChatByDefault: true,
      agentSessionHistoryOpenMode: undefined
    }
    const { root, container } = await renderExperimentalPane({ updateSettings, settings })
    const historySelect = container.querySelector<HTMLButtonElement>(
      '[data-testid="session-history-default-view-select"]'
    )

    expect(historySelect?.getAttribute('data-value')).toBe('terminal')

    const structuredOption = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
    ).find((button) => button.getAttribute('data-value') === 'structured')
    if (!structuredOption) {
      throw new Error('Chat UI session-history option was not rendered')
    }

    await act(async () => {
      structuredOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ agentSessionHistoryOpenMode: 'structured' })
    expect(updateSettings).toHaveBeenCalledTimes(1)
    root.unmount()
  })

  it('defaults link previews to hover and persists paragraph placement', async () => {
    const updateSettings = vi.fn()
    const settings = { ...getDefaultSettings('/tmp'), experimentalNativeChat: true }
    const { root, container } = await renderExperimentalPane({ updateSettings, settings })

    expect(container.textContent).toContain('Link previews')
    expect(
      container
        .querySelector('[data-testid="native-chat-link-preview-mode-select"]')
        ?.getAttribute('data-value')
    ).toBe('hover')

    const paragraphOption = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
    ).find((button) => button.getAttribute('data-value') === 'paragraph')
    if (!paragraphOption) {
      throw new Error('Paragraph link-preview option was not rendered')
    }

    await act(async () => {
      paragraphOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ nativeChatLinkPreviewMode: 'paragraph' })
    root.unmount()
  })

  // Each control writes only its own preference.
  it.each([false, true])(
    'changing structured chat leaves the default view (%s) unchanged',
    async (defaultToChat) => {
      const updateSettings = vi.fn()
      const settings = {
        ...getDefaultSettings('/tmp'),
        experimentalNativeChat: true,
        experimentalStructuredNativeChat: false,
        openAgentTabsInChatByDefault: defaultToChat
      }
      const { root, container } = await renderExperimentalPane({ updateSettings, settings })

      const structuredSwitch = container.querySelector<HTMLButtonElement>(
        '#experimental-native-chat button[role="switch"][aria-label="Toggle updated structured native chat"]'
      )
      if (!structuredSwitch) {
        throw new Error('Structured native chat switch was not rendered')
      }

      await act(async () => {
        structuredSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(updateSettings).toHaveBeenCalledWith({ experimentalStructuredNativeChat: true })

      const terminalChatOption = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-slot="select-item"]')
      ).find((button) => button.getAttribute('data-value') === 'terminal-chat')
      if (!terminalChatOption) {
        throw new Error('Terminal chat default-view option was not rendered')
      }

      await act(async () => {
        terminalChatOption.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(updateSettings).toHaveBeenCalledWith({ openAgentTabsInChatByDefault: false })
      expect(updateSettings).toHaveBeenCalledTimes(2)
      root.unmount()
    }
  )

  it('renders the agent sleep idle duration as configurable minutes', async () => {
    const updateSettings = vi.fn()
    const settings = {
      ...getDefaultSettings('/tmp'),
      experimentalAgentHibernation: true
    }
    const { root, container } = await renderExperimentalPane({ updateSettings, settings })

    const idleInput = container.querySelector<HTMLInputElement>(
      '#experimental-agent-hibernation input[type="number"]'
    )
    if (!idleInput) {
      throw new Error('Agent sleep duration input was not rendered')
    }

    expect(idleInput.value).toBe('30')
    expect(idleInput.min).toBe('1')
    expect(idleInput.max).toBe('1440')
    expect(idleInput.step).toBe('1')
    expect(container.textContent).toContain('How many idle minutes')
    expect(container.textContent).toContain('minutes')
    root.unmount()
  })

  it('enables agent sleep through the experimental switch', async () => {
    const updateSettings = vi.fn()
    const { root, container } = await renderExperimentalPane({ updateSettings })

    const switchButton = container.querySelector<HTMLButtonElement>(
      '#experimental-agent-hibernation button[role="switch"]'
    )
    if (!switchButton) {
      throw new Error('Agent sleep switch was not rendered')
    }

    await act(async () => {
      switchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ experimentalAgentHibernation: true })
    root.unmount()
  })

  it('enables new card style through the experimental switch', async () => {
    const updateSettings = vi.fn()
    const { root, container } = await renderExperimentalPane({ updateSettings })

    const switchButton = container.querySelector<HTMLButtonElement>(
      '#experimental-new-worktree-card-style button[role="switch"]'
    )
    if (!switchButton) {
      throw new Error('New card style switch was not rendered')
    }

    await act(async () => {
      switchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSettings).toHaveBeenCalledWith({ experimentalNewWorktreeCardStyle: true })
    root.unmount()
  })
})
