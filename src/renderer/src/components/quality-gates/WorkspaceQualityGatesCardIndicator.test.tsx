// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { QualityGateStatusView } from './quality-gate-status-view'

const mocks = vi.hoisted(() => {
  const state: {
    view: QualityGateStatusView | null
    target: RuntimeClientTarget | null
    activeWorktreeId: string | null
    statusArgs: unknown[][]
  } = { view: null, target: { kind: 'local' }, activeWorktreeId: null, statusArgs: [] }
  return state
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace('{{value0}}', String(values?.value0 ?? ''))
}))
vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="tooltip">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ activeWorktreeId: mocks.activeWorktreeId })
}))
vi.mock('../right-sidebar/worktree-git-owner-target', () => ({
  useWorktreeGitOwnerTarget: () => mocks.target
}))
vi.mock('./use-quality-gate-status', () => ({
  useQualityGateStatus: (...args: unknown[]) => {
    mocks.statusArgs.push(args)
    return { view: mocks.view, refresh: () => {} }
  }
}))

import { gateRun, gateStatus, liveGateRun } from './quality-gate-status-test-fixtures'
import { emptyQualityGateStatusView } from './quality-gate-status-view'
import { WorkspaceQualityGatesCardIndicator } from './WorkspaceQualityGatesCardIndicator'

const WORKTREE = 'repo::/work'
const lint = { id: 'lint', name: 'Lint', command: 'echo ok', required: true, timeoutSeconds: 60 }

function show(
  status: ReturnType<typeof gateStatus> | null,
  overrides: Partial<QualityGateStatusView> = {},
  held: 'held-here' | 'not-held-here' = 'held-here'
) {
  mocks.view = { ...emptyQualityGateStatusView('scope'), status, ...overrides }
  return render(
    <WorkspaceQualityGatesCardIndicator
      worktreeId={WORKTREE}
      gateDefinitions={held === 'held-here' ? [lint] : undefined}
    />
  )
}
const glyph = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-workspace-quality-gates-card]')
const lastStatusArgs = (): unknown[] => mocks.statusArgs.at(-1) ?? []

describe('WorkspaceQualityGatesCardIndicator', () => {
  beforeEach(() => {
    mocks.target = { kind: 'local' }
    mocks.activeWorktreeId = null
    mocks.statusArgs = []
  })
  afterEach(cleanup)

  it.each([
    ['passed', gateStatus(gateRun()), 'text-status-success', 'Local gates: 1 passed'],
    [
      'failed',
      gateStatus(gateRun({ status: 'failed', exitCode: 1 })),
      'text-destructive',
      'Local gates: 1 failed'
    ],
    ['running', gateStatus(liveGateRun()), 'text-muted-foreground', 'Local gates: 1 running'],
    [
      'outdated',
      gateStatus(gateRun({ freshness: { state: 'stale', reasons: ['tree-changed'] } })),
      'text-status-warning',
      'Local gates: 1 out of date'
    ]
  ])('shows gates that %s with their own glyph, tone and label', (state, status, tone, label) => {
    show(status)

    expect(glyph()?.dataset.workspaceQualityGatesCard).toBe(state)
    expect(screen.getByRole('img', { name: label })).toBe(glyph())
    expect(glyph()?.querySelector('svg')?.getAttribute('class')).toContain(tone)
    expect(screen.getByTestId('tooltip').textContent).toBe(label)
  })

  it('renders nothing and asks nothing for a local workspace without gates', () => {
    const { container } = show(null, {}, 'not-held-here')

    expect(container.innerHTML).toBe('')
    expect(lastStatusArgs()[0]).toBeNull()
  })

  it('renders nothing while the gates never ran, and when the host has none', () => {
    expect(show(gateStatus(null)).container.innerHTML).toBe('')
    cleanup()
    expect(show(gateStatus()).container.innerHTML).toBe('')
  })

  it('asks the host that owns a remote workspace: its gates are not held here', () => {
    mocks.target = { kind: 'environment', environmentId: 'env-ssh' }
    show(gateStatus(gateRun({ status: 'failed', exitCode: 1 })), {}, 'not-held-here')

    expect(lastStatusArgs()[0]).toEqual({ kind: 'environment', environmentId: 'env-ssh' })
    expect(glyph()?.dataset.workspaceQualityGatesCard).toBe('failed')
  })

  it('shows a remote host that stopped answering as unknown, not as failed', () => {
    mocks.target = { kind: 'environment', environmentId: 'env-ssh' }
    show(gateStatus(gateRun({ status: 'failed', exitCode: 1 })), { contactLost: true })

    expect(glyph()?.dataset.workspaceQualityGatesCard).toBe('unknown')
    expect(glyph()?.querySelector('svg')?.getAttribute('class')).toContain('text-status-warning')
  })

  it('watches in the background unless its workspace is the active one', () => {
    show(gateStatus(gateRun()))
    expect(lastStatusArgs().slice(1)).toEqual([
      WORKTREE,
      JSON.stringify([lint]),
      { watch: true, background: true }
    ])
    cleanup()

    mocks.activeWorktreeId = WORKTREE
    show(gateStatus(gateRun()))
    expect(lastStatusArgs()[3]).toEqual({ watch: true, background: false })
  })

  it('renders nothing when the owner of the workspace cannot be resolved', () => {
    mocks.target = null
    const { container } = show(null)

    expect(container.innerHTML).toBe('')
    expect(lastStatusArgs()[0]).toBeNull()
  })
})
