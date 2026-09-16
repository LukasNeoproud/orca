// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type * as ReactModule from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat-session-options'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) => {
    if (!values) {
      return fallback
    }
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      fallback
    )
  }
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/dropdown-menu', () => {
  const React = require('react') as typeof ReactModule
  return {
    DropdownMenu: ({
      children,
      defaultOpen
    }: {
      children: React.ReactNode
      defaultOpen?: boolean
    }) => (
      <div data-testid="dropdown-root" data-open={defaultOpen ? 'true' : 'false'}>
        {children}
      </div>
    ),
    DropdownMenuTrigger: ({
      children,
      disabled
    }: {
      children: React.ReactNode
      disabled?: boolean
    }) => <div data-disabled={disabled || undefined}>{children}</div>,
    DropdownMenuContent: ({
      children,
      side,
      collisionPadding
    }: {
      children: React.ReactNode
      side?: string
      collisionPadding?: number
    }) => (
      <div
        data-testid="session-option-menu"
        data-side={side}
        data-collision-padding={collisionPadding}
      >
        {children}
      </div>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { onSelect?: () => void }) => (
      <button disabled={disabled} onClick={() => onSelect?.()}>
        {children}
      </button>
    ),
    // Why: exercises value binding + onValueChange contract the real Radix
    // group provides; selected value is exposed via data-radio-value.
    DropdownMenuRadioGroup: ({
      children,
      value,
      onValueChange
    }: {
      children: React.ReactNode
      value?: string
      onValueChange?: (value: string) => void
    }) => (
      <div
        role="radiogroup"
        data-radio-value={value ?? ''}
        data-on-value-change={onValueChange ? '1' : '0'}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) {
            return child
          }
          const props = child.props as {
            value?: string
            disabled?: boolean
            children?: React.ReactNode
          }
          const selected = props.value !== undefined && props.value === value
          return (
            <button
              key={props.value}
              role="radio"
              aria-checked={selected}
              disabled={props.disabled}
              data-value={props.value}
              data-state={selected ? 'checked' : 'unchecked'}
              onClick={() => {
                if (props.value !== undefined) {
                  onValueChange?.(props.value)
                }
              }}
            >
              {props.children}
            </button>
          )
        })}
      </div>
    ),
    DropdownMenuRadioItem: ({
      children,
      disabled,
      value
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) => (
      // Why: parent RadioGroup mock reads `value` via Children.map — keep it on
      // props even though native span has no value attribute.
      <span
        data-radio-item
        data-disabled={disabled || undefined}
        {...({ value } as Record<string, string>)}
      >
        {children}
      </span>
    )
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { toast } from 'sonner'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'

const surface = {
  getSnapshot: vi.fn(() => []),
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: vi.fn(() => vi.fn())
}

function model(overrides: Partial<SessionOptionDescriptor> = {}): SessionOptionDescriptor {
  return {
    id: 'model',
    label: 'Model',
    category: 'model',
    kind: {
      type: 'select',
      currentValue: 'opus',
      choices: [
        { value: 'opus', label: 'Opus 4.8' },
        { value: 'sonnet', label: 'Sonnet 5' }
      ]
    },
    valueSource: 'applied',
    transport: 'catalog',
    settable: true,
    ...overrides
  }
}

const effort: SessionOptionDescriptor = {
  id: 'effort',
  label: 'Effort',
  category: 'thought_level',
  kind: {
    type: 'select',
    currentValue: 'high',
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' }
    ]
  },
  valueSource: 'applied',
  transport: 'catalog',
  settable: true
}

const fast: SessionOptionDescriptor = {
  id: 'fastMode',
  label: 'Fast mode',
  category: 'mode',
  kind: { type: 'boolean', currentValue: true },
  valueSource: 'applied',
  transport: 'catalog',
  settable: true
}

const permissions = {
  id: 'permissions',
  label: 'Permissions',
  category: 'mode',
  kind: {
    type: 'select',
    currentValue: 'workspace-write',
    choices: [
      { value: 'read-only', label: 'Read only' },
      { value: 'workspace-write', label: 'Workspace' },
      { value: 'auto-review', label: 'Auto review' },
      { value: 'full-access', label: 'Full access' }
    ]
  },
  valueSource: 'applied',
  transport: 'catalog',
  settable: true
} satisfies SessionOptionDescriptor

afterEach(() => cleanup())

describe('NativeChatSessionOptionPickers', () => {
  it('shows Auto review as a selected permission and sets it as a named choice', async () => {
    const setOption = vi.fn(async () => ({ snapshot: [] }))
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[
          model(),
          { ...permissions, kind: { ...permissions.kind, currentValue: 'auto-review' } }
        ]}
        isWorking={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Permissions Auto review' })).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'Auto review' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.queryByRole('radio', { name: /Custom/ })).toBeNull()

    rerender(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), permissions]}
        isWorking={false}
      />
    )
    await act(async () => screen.getByRole('radio', { name: 'Auto review' }).click())
    expect(setOption).toHaveBeenCalledExactlyOnceWith('permissions', 'auto-review')
  })

  it('separates permissions from effort and fast, including requested picker routing', () => {
    const serviceTier: SessionOptionDescriptor = {
      ...fast,
      id: 'serviceTier',
      kind: {
        type: 'select',
        currentValue: 'priority',
        choices: [
          { value: 'priority', label: 'Fast' },
          { value: 'default', label: 'Off' }
        ]
      }
    }
    const snapshot = [model(), effort, serviceTier, permissions]
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={snapshot}
        isWorking={false}
        pickerRequest={{ id: 'permissions', sequence: 1 }}
      />
    )
    const menus = screen.getAllByTestId('session-option-menu')
    expect(menus).toHaveLength(3)
    expect(within(menus[1]).getByText('Effort')).not.toBeNull()
    expect(within(menus[1]).getByText('Fast mode')).not.toBeNull()
    expect(within(menus[1]).queryByText('Permissions')).toBeNull()
    expect(
      within(menus[2]).getByRole('radio', { name: 'Workspace' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(within(menus[2]).queryByText('Effort')).toBeNull()
    expect(screen.getByRole('button', { name: 'Session options High · Fast' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Permissions Workspace' })).not.toBeNull()
    expect(
      screen.getAllByTestId('dropdown-root').map((root) => root.getAttribute('data-open'))
    ).toEqual(['false', 'false', 'true'])
    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={snapshot}
        isWorking={false}
        pickerRequest={{ id: 'serviceTier', sequence: 2 }}
      />
    )
    expect(
      screen.getAllByTestId('dropdown-root').map((root) => root.getAttribute('data-open'))
    ).toEqual(['false', 'true', 'false'])
  })

  it('keeps unknown permissions separate and respects unavailable and working states', () => {
    const unknown: SessionOptionDescriptor = {
      ...permissions,
      valueSource: 'unknown',
      settable: false,
      disabledReason: 'available-after-session-start',
      kind: { ...permissions.kind, currentValue: undefined }
    }
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), unknown]}
        isWorking={false}
      />
    )
    expect(screen.getAllByTestId('session-option-menu')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Permissions' })).not.toBeNull()
    expect(screen.getAllByText('Available after the session starts.').length).toBeGreaterThan(0)
    expect(screen.getByRole('radio', { name: 'Read only' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Read only' }).getAttribute('aria-checked')).toBe(
      'false'
    )
    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort, permissions]}
        isWorking
      />
    )
    for (const root of screen.getAllByTestId('dropdown-root')) {
      expect(root.querySelector('[data-disabled="true"]')).not.toBeNull()
    }
  })

  it('shows a reported custom permission policy without making it selectable', async () => {
    const setOption = vi.fn(async () => ({ snapshot: [] }))
    const custom: SessionOptionDescriptor = {
      ...permissions,
      kind: { ...permissions.kind, currentValue: undefined },
      valueSource: 'reported',
      currentValueLabel: 'Custom',
      currentValueDescription: 'Workspace sandbox · Auto review'
    }
    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), custom]}
        isWorking={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Permissions Custom' }).textContent).toContain(
      'Custom'
    )
    const current = screen.getByRole('radio', {
      name: 'Custom Workspace sandbox · Auto review'
    })
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(current.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Workspace' }).getAttribute('aria-checked')).toBe(
      'false'
    )
    current.click()
    expect(setOption).not.toHaveBeenCalled()
    await act(async () => screen.getByRole('radio', { name: 'Workspace' }).click())
    expect(setOption).toHaveBeenCalledExactlyOnceWith('permissions', 'workspace-write')
  })

  it('updates permissions through the surface, blocks all pickers while pending and reports failure', async () => {
    let rejectUpdate!: (error: Error) => void
    const setOption = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectUpdate = reject
        })
    )
    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), effort, fast, permissions]}
        isWorking={false}
      />
    )
    await act(async () => screen.getByRole('radio', { name: 'Auto review' }).click())
    expect(setOption).toHaveBeenCalledExactlyOnceWith('permissions', 'auto-review')
    for (const root of screen.getAllByTestId('dropdown-root')) {
      expect(root.querySelector('[data-disabled="true"]')).not.toBeNull()
    }
    expect(screen.getByRole('radio', { name: 'Low' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('radio', { name: 'Full access' }).hasAttribute('disabled')).toBe(true)
    await act(async () => rejectUpdate(new Error('Permissions refused')))
    expect(toast.error).toHaveBeenCalledWith('Could not update option', {
      description: 'Permissions refused'
    })
    expect(screen.getByRole('button', { name: 'Permissions Workspace' })).not.toBeNull()
    for (const root of screen.getAllByTestId('dropdown-root')) {
      expect(root.querySelector('[data-disabled="true"]')).toBeNull()
    }
  })

  it('opens the native picker requested by a structured slash command', async () => {
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort]}
        isWorking={false}
        pickerRequest={null}
      />
    )

    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort]}
        isWorking={false}
        pickerRequest={{ id: 'model', sequence: 1 }}
      />
    )
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Model Opus 4.8' })
          .closest('[data-testid="dropdown-root"]')
          ?.getAttribute('data-open')
      ).toBe('true')
    )

    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort]}
        isWorking={false}
        pickerRequest={{ id: 'effort', sequence: 2 }}
      />
    )
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Effort High' })
          .closest('[data-testid="dropdown-root"]')
          ?.getAttribute('data-open')
      ).toBe('true')
    )
  })

  it('prefers collision-aware upward placement for model and option menus', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort]}
        isWorking={false}
      />
    )

    const menus = screen.getAllByTestId('session-option-menu')
    expect(menus).toHaveLength(2)
    for (const menu of menus) {
      expect(menu.getAttribute('data-side')).toBe('top')
      expect(menu.getAttribute('data-collision-padding')).toBe('8')
    }
  })

  it('renders model and joined option labels, and hides an empty options pill', () => {
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), effort, fast]}
        isWorking={false}
      />
    )
    expect(screen.getByRole('button', { name: 'Model Opus 4.8' }).textContent).toContain('Opus 4.8')
    expect(screen.getByRole('button', { name: 'Model Opus 4.8' }).textContent).not.toContain(
      'Model:'
    )
    expect(screen.getByRole('button', { name: 'Effort High · Fast' }).textContent).toContain(
      'High · Fast'
    )
    expect(
      screen
        .getByRole('button', { name: 'Model Opus 4.8' })
        .compareDocumentPosition(screen.getByRole('button', { name: 'Effort High · Fast' })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0)

    rerender(
      <NativeChatSessionOptionPickers surface={surface} snapshot={[model()]} isWorking={false} />
    )
    expect(screen.queryByRole('button', { name: /Effort/ })).toBeNull()
  })

  it('names a lone unknown effort control explicitly', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[
          model(),
          { ...effort, kind: { ...effort.kind, currentValue: undefined }, valueSource: 'unknown' }
        ]}
        isWorking={false}
      />
    )

    expect(screen.getByRole('button', { name: 'Effort' }).textContent).toContain('Effort')
  })

  it('disables both picker triggers while the agent is working', () => {
    render(
      <NativeChatSessionOptionPickers surface={surface} snapshot={[model(), effort]} isWorking />
    )
    expect(
      screen
        .getByRole('button', { name: 'Model Opus 4.8' })
        .parentElement?.getAttribute('data-disabled')
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Effort High' })
        .parentElement?.getAttribute('data-disabled')
    ).toBe('true')
  })

  it('does not duplicate titles for unknown values or misname generic controls', () => {
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[
          model({
            kind: { type: 'select', choices: [] },
            valueSource: 'unknown'
          }),
          { ...effort, kind: { ...effort.kind, currentValue: undefined }, valueSource: 'unknown' }
        ]}
        isWorking={false}
      />
    )
    expect(screen.getByRole('button', { name: 'Model' }).textContent).toContain('Model')
    expect(screen.getByRole('button', { name: 'Model' }).textContent).not.toContain('Model: Model')
    expect(screen.getByRole('button', { name: 'Effort' }).textContent).not.toContain(
      'Effort: Effort'
    )

    rerender(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model(), fast]}
        isWorking={false}
      />
    )
    expect(screen.getByRole('button', { name: 'Session options Fast' }).textContent).toContain(
      'Fast'
    )
    expect(screen.queryByRole('button', { name: /^Effort/ })).toBeNull()
  })

  // The terminal transport typed the value at the agent and has not read it back,
  // so the pill says so; the structured transport's own per-turn report is the
  // confirmation, which makes the same hedge transient noise there.
  it('hedges a dispatched value the terminal transport produced', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model({ valueSource: 'dispatched', transport: 'catalog' })]}
        isWorking={false}
      />
    )
    expect(screen.getByText('Model')).not.toBeNull()
    expect(screen.getAllByText('Sent to the agent — not confirmed').length).toBeGreaterThan(0)
  })

  it('does not hedge a dispatched value the structured transport produced', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[model({ valueSource: 'dispatched', transport: 'agent-session' })]}
        isWorking={false}
      />
    )
    expect(screen.getByText('Model')).not.toBeNull()
    expect(screen.queryByText(/not confirmed/)).toBeNull()
  })

  it.each(['catalog', 'agent-session'] as const)(
    'does not hedge a reported value on the %s transport',
    (transport) => {
      render(
        <NativeChatSessionOptionPickers
          surface={surface}
          snapshot={[model({ valueSource: 'reported', transport })]}
          isWorking={false}
        />
      )
      expect(screen.getByText('Model')).not.toBeNull()
      expect(screen.queryByText(/not confirmed/)).toBeNull()
    }
  )

  it('renders agent-picker routes as one action instead of radio choices', async () => {
    const invokeAction = vi.fn().mockResolvedValue({ snapshot: [] })
    const liveSurface = { ...surface, invokeAction }
    render(
      <NativeChatSessionOptionPickers
        surface={liveSurface}
        snapshot={[
          model({
            kind: {
              type: 'select',
              choices: [
                { value: 'gpt-5.5', label: 'GPT-5.5' },
                { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' }
              ]
            },
            valueSource: 'unknown',
            action: { type: 'agent-picker' }
          })
        ]}
        isWorking={false}
      />
    )
    expect(screen.getByRole('button', { name: 'Choose in agent picker…' })).not.toBeNull()
    expect(screen.queryByText('GPT-5.5')).toBeNull()
    expect(screen.queryByText('GPT-5.2 Codex')).toBeNull()
    screen.getByRole('button', { name: 'Choose in agent picker…' }).click()
    await waitFor(() => expect(invokeAction).toHaveBeenCalledWith('model'))
  })

  it('uses a Toggle action for unknown flip-only options via invokeAction', async () => {
    const invokeAction = vi.fn().mockResolvedValue({ snapshot: [] })
    const setOption = vi.fn().mockResolvedValue({ snapshot: [] })
    const liveSurface = { ...surface, setOption, invokeAction }
    render(
      <NativeChatSessionOptionPickers
        surface={liveSurface}
        snapshot={[
          model(),
          {
            ...fast,
            kind: { type: 'boolean' },
            valueSource: 'unknown',
            action: { type: 'toggle-command' }
          }
        ]}
        isWorking={false}
      />
    )
    expect(screen.getByText('Toggle fast mode')).not.toBeNull()
    expect(screen.queryByText('On')).toBeNull()
    expect(screen.queryByText('Off')).toBeNull()
    screen.getByText('Toggle fast mode').click()
    await waitFor(() => expect(invokeAction).toHaveBeenCalledWith('fastMode'))
    expect(setOption).not.toHaveBeenCalled()
  })

  it('uses On/Off radios for known boolean options without inventing a selection', async () => {
    const setOption = vi.fn().mockResolvedValue({ snapshot: [] })
    const liveSurface = { ...surface, setOption }
    const { rerender } = render(
      <NativeChatSessionOptionPickers
        surface={liveSurface}
        snapshot={[
          model(),
          {
            ...fast,
            kind: { type: 'boolean', currentValue: true },
            valueSource: 'applied',
            action: undefined
          }
        ]}
        isWorking={false}
      />
    )
    expect(screen.queryByText('Toggle fast mode')).toBeNull()
    const onRadio = screen.getByRole('radio', { name: 'On' })
    expect(onRadio.getAttribute('data-state')).toBe('checked')
    expect(onRadio.getAttribute('aria-checked')).toBe('true')
    const fastGroup = onRadio.parentElement
    expect(fastGroup?.getAttribute('data-radio-value')).toBe('on')
    expect(fastGroup?.getAttribute('data-on-value-change')).toBe('1')
    screen.getByRole('radio', { name: 'Off' }).click()
    await waitFor(() => expect(setOption).toHaveBeenCalledWith('fastMode', false))

    setOption.mockClear()
    rerender(
      <NativeChatSessionOptionPickers
        surface={liveSurface}
        snapshot={[
          model(),
          {
            id: 'thinking',
            label: 'Thinking',
            category: 'mode',
            kind: { type: 'boolean' },
            valueSource: 'unknown',
            transport: 'catalog',
            settable: true
          }
        ]}
        isWorking={false}
      />
    )
    // Unknown composed boolean: hint + radios present, nothing pre-selected.
    expect(screen.getByText('Current value unknown — pick On or Off')).not.toBeNull()
    const thinkingGroup = screen.getByRole('radio', { name: 'On' }).parentElement
    expect(thinkingGroup?.getAttribute('data-radio-value')).toBe('')
    screen.getByRole('radio', { name: 'Off' }).click()
    await waitFor(() => expect(setOption).toHaveBeenCalledWith('thinking', false))
  })

  it('tooltips a dispatched option pill with the category alone', () => {
    render(
      <NativeChatSessionOptionPickers
        surface={surface}
        snapshot={[
          model(),
          {
            id: 'thinking',
            label: 'Thinking',
            category: 'mode',
            kind: { type: 'boolean', currentValue: true },
            valueSource: 'dispatched',
            transport: 'catalog',
            settable: true
          }
        ]}
        isWorking={false}
      />
    )
    expect(screen.getAllByText('Thinking').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sent to the agent — not confirmed').length).toBeGreaterThan(0)
  })
})
