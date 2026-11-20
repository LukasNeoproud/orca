// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))
vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ repos: [], worktreesByRepo: {}, activeWorktreeId: null })
}))
vi.mock('@/lib/quality-gate-client', () => ({
  startQualityGates: vi.fn(),
  cancelQualityGates: vi.fn(),
  fetchQualityGateOutput: vi.fn(),
  classifyQualityGateCallFailure: vi.fn(),
  // An older host: it does not take the settings from this app.
  qualityGateRepositorySettingsSupported: vi.fn().mockResolvedValue(false)
}))
vi.mock('./use-quality-gate-status', async () => {
  const { emptyQualityGateStatusView } = await import('./quality-gate-status-view')
  return {
    useQualityGateStatus: () => ({ view: emptyQualityGateStatusView('scope'), refresh: () => {} })
  }
})

import { RepositoryQualityGatesSection } from './RepositoryQualityGatesSection'

const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }

function show(overrides: Partial<Repo>): void {
  const repo: Repo = {
    id: 'repo',
    path: '/work',
    displayName: 'Repo',
    badgeColor: '#000000',
    addedAt: 0,
    qualityGates: [lint],
    ...overrides
  }
  render(<RepositoryQualityGatesSection repo={repo} updateRepo={vi.fn()} />)
}

const loopSwitch = (): HTMLElement | null => screen.queryByRole('switch', { name: 'Feedback loop' })

describe('RepositoryQualityGatesSection feedback loop', () => {
  afterEach(cleanup)

  it('offers the loop for a repository with gates on this computer, a folder without git too', () => {
    show({})
    expect(loopSwitch()).toBeTruthy()
    cleanup()

    show({ kind: 'folder' })
    expect(loopSwitch()).toBeTruthy()
  })

  it('offers no loop before a gate exists, nor for a repository this app cannot write', async () => {
    show({ qualityGates: [] })
    expect(loopSwitch()).toBeNull()
    cleanup()

    show({ connectionId: 'ssh-box' })
    expect(loopSwitch()).toBeNull()
    cleanup()

    show({ executionHostId: 'runtime:env-1' })
    // Let the host's answer about its build arrive.
    await act(async () => {})
    expect(loopSwitch()).toBeNull()
  })
})
