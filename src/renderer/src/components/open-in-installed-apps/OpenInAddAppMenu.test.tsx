// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenInApplication } from '../../../../shared/ui-chrome-types'

type ItemProps = { children?: ReactNode; disabled?: boolean; onSelect?: () => void }

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => <em>{children}</em>,
  DropdownMenuItem: ({ children, disabled, onSelect }: ItemProps) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  )
}))

import { OpenInMenuSetting } from '../settings/OpenInMenuSetting'

const detectOpenInApplications = vi.fn<() => Promise<OpenInApplication[]>>()
let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderSetting(
  applications: OpenInApplication[],
  updateSettings: (updates: unknown) => void
): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<OpenInMenuSetting applications={applications} updateSettings={updateSettings} />)
  })
  return container
}

function menuItem(view: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...view.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.startsWith(label)
  )
}

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(window, { api: { shell: { detectOpenInApplications } } }))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  detectOpenInApplications.mockReset()
  vi.unstubAllGlobals()
})

describe('OpenInAddAppMenu', () => {
  const vscode = { id: 'vscode', label: 'VS Code', command: 'code' }
  const studio = { id: 'android-studio', label: 'Android Studio', command: 'studio' }

  it('adds Android Studio from the editors found on this computer', async () => {
    detectOpenInApplications.mockResolvedValue([vscode, studio])
    const updateSettings = vi.fn()
    const view = await renderSetting([vscode], updateSettings)

    expect(view.textContent).toContain('Installed')
    expect(menuItem(view, 'VS Code')?.disabled).toBe(true)
    act(() => menuItem(view, 'Android Studio')?.click())

    expect(updateSettings).toHaveBeenCalledWith({ openInApplications: [vscode, studio] })
  })

  it('keeps the presets and the custom app when nothing is found', async () => {
    detectOpenInApplications.mockRejectedValue(new Error('no IPC'))
    const view = await renderSetting([], vi.fn())

    expect(view.textContent).not.toContain('Installed')
    expect(menuItem(view, 'VS Code')).toBeDefined()
    expect(menuItem(view, 'Cursor')).toBeDefined()
    expect(menuItem(view, 'Custom app')).toBeDefined()
  })
})
