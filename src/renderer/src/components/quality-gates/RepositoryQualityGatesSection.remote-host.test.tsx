// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

type Store = { repos: Repo[]; worktreesByRepo: Record<string, never>; activeWorktreeId: null }

const { supported, save, store } = vi.hoisted(() => {
  const state: Store = { repos: [], worktreesByRepo: {}, activeWorktreeId: null }
  return { supported: vi.fn(), save: vi.fn(), store: state }
})

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
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(store), {
    setState: (update: (state: Store) => Partial<Store>) => Object.assign(store, update(store))
  })
}))
vi.mock('@/lib/quality-gate-client', () => ({
  startQualityGates: vi.fn(),
  cancelQualityGates: vi.fn(),
  fetchQualityGateOutput: vi.fn(),
  classifyQualityGateCallFailure: vi.fn(),
  qualityGateRepositorySettingsSupported: supported,
  saveQualityGateRepositorySettings: save
}))
vi.mock('./use-quality-gate-status', async () => {
  const { emptyQualityGateStatusView } = await import('./quality-gate-status-view')
  return {
    useQualityGateStatus: () => ({ view: emptyQualityGateStatusView('scope'), refresh: () => {} })
  }
})

import { RepositoryQualityGatesSection } from './RepositoryQualityGatesSection'

const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const host = { kind: 'environment', environmentId: 'env-1' }
const onHost: Repo = {
  id: 'repo',
  path: '/srv/app',
  displayName: 'Repo',
  badgeColor: '#000000',
  addedAt: 0,
  executionHostId: 'runtime:env-1',
  qualityGates: [lint]
}
const updateRepo = vi.fn()

async function show(repo: Repo): Promise<void> {
  store.repos = [repo, { ...repo, executionHostId: undefined, qualityGates: [] }]
  render(<RepositoryQualityGatesSection repo={repo} updateRepo={updateRepo} />)
  // Let the host's answer about its build arrive.
  await act(async () => {})
}

const loopSwitch = (): HTMLElement | null => screen.queryByRole('switch', { name: 'Feedback loop' })
const addGate = (): HTMLElement | null => screen.queryByRole('button', { name: 'Add Gate' })

describe('RepositoryQualityGatesSection for a repository of another Orca host', () => {
  beforeEach(() => {
    supported.mockReset()
    save.mockReset()
    updateRepo.mockReset()
  })
  afterEach(cleanup)

  it('lets the user set up gates and the loop when the host takes them from this app', async () => {
    supported.mockResolvedValue(true)
    await show(onHost)

    expect(supported).toHaveBeenCalledWith(host)
    expect(addGate()).toBeTruthy()
    expect(loopSwitch()).toBeTruthy()
    expect(screen.getByText(/saved in Orca on that host/)).toBeTruthy()
    expect(screen.getByText(/kept in Orca on the host of this repository/)).toBeTruthy()
  })

  it('saves on the host, never into this app, and shows what the host stored', async () => {
    supported.mockResolvedValue(true)
    save.mockResolvedValue({ gates: [lint], feedbackLoop: { enabled: true, maxRounds: 3 } })
    await show(onHost)

    fireEvent.click(loopSwitch()!)

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(host, 'repo', {
        feedbackLoop: { enabled: true, maxRounds: 3 }
      })
    )
    expect(updateRepo).not.toHaveBeenCalled()
    // The row of that host changed; this app's row with the same id did not.
    await waitFor(() =>
      expect(store.repos).toEqual([
        { ...onHost, qualityGateFeedbackLoop: { enabled: true, maxRounds: 3 } },
        { ...onHost, executionHostId: undefined, qualityGates: [] }
      ])
    )
  })

  it('removes a gate on the host', async () => {
    supported.mockResolvedValue(true)
    save.mockResolvedValue({ gates: [], feedbackLoop: { enabled: false, maxRounds: 3 } })
    await show(onHost)

    // The first click asks, the second confirms.
    fireEvent.click(screen.getByRole('button', { name: 'Remove {{value0}}' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove {{value0}}' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(host, 'repo', { gates: [] }))
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('says the save failed when the host refuses or does not answer', async () => {
    supported.mockResolvedValue(true)
    save.mockRejectedValue(new Error('runtime_timeout'))
    await show(onHost)

    fireEvent.click(loopSwitch()!)

    expect(await screen.findByText('The feedback loop setting could not be saved.')).toBeTruthy()
    expect(store.repos[0].qualityGateFeedbackLoop).toBeUndefined()
  })

  it.each([
    ['is older', () => supported.mockResolvedValue(false)],
    ['does not answer', () => supported.mockRejectedValue(new Error('runtime_timeout'))]
  ])('shows the gates read-only when the host %s', async (_name, arrange) => {
    arrange()
    await show(onHost)

    expect(screen.getByText('Lint')).toBeTruthy()
    expect(addGate()).toBeNull()
    expect(loopSwitch()).toBeNull()
    expect(screen.getByText(/are set up in Orca on that host/)).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it('never asks a host reached over plain SSH, where no gate runs', async () => {
    await show({ ...onHost, executionHostId: undefined, connectionId: 'ssh-box' })

    expect(supported).not.toHaveBeenCalled()
    expect(addGate()).toBeNull()
    expect(loopSwitch()).toBeNull()
  })
})
