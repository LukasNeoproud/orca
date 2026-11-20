// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateProposal } from '../../../../shared/quality-gate-proposal'
import type { Repo } from '../../../../shared/repo-types'

type Store = {
  repos: Repo[]
  worktreesByRepo: Record<string, { id: string; displayName: string }[]>
  activeWorktreeId: null
}

const mocks = vi.hoisted(() => {
  const store: Store = { repos: [], worktreesByRepo: {}, activeWorktreeId: null }
  return {
    store,
    proposalsSupported: vi.fn(),
    fetchProposal: vi.fn(),
    answer: vi.fn(),
    settingsSupported: vi.fn()
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(value\d)\}\}/g, (_match, name: string) => String(values?.[name] ?? '')),
  i18n: { language: 'en' }
}))
vi.mock('@/i18n/relative-time-format', () => ({ formatUiRelativeTime: () => '5 minutes ago' }))
vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(mocks.store), {
    setState: (update: (state: Store) => Partial<Store>) =>
      Object.assign(mocks.store, update(mocks.store))
  })
}))
vi.mock('@/lib/quality-gate-client', () => ({
  startQualityGates: vi.fn(),
  cancelQualityGates: vi.fn(),
  fetchQualityGateOutput: vi.fn(),
  classifyQualityGateCallFailure: (error: unknown) =>
    error instanceof Error && error.message === 'runtime_timeout' ? 'contact-lost' : 'refused',
  qualityGateRepositorySettingsSupported: mocks.settingsSupported,
  saveQualityGateRepositorySettings: vi.fn()
}))
vi.mock('@/lib/quality-gate-proposal-client', () => ({
  qualityGateProposalsSupported: mocks.proposalsSupported,
  fetchQualityGateProposal: mocks.fetchProposal,
  answerQualityGateProposal: mocks.answer
}))
vi.mock('./use-quality-gate-status', async () => {
  const { emptyQualityGateStatusView } = await import('./quality-gate-status-view')
  return {
    useQualityGateStatus: () => ({ view: emptyQualityGateStatusView('scope'), refresh: () => {} })
  }
})

import { RepositoryQualityGatesSection } from './RepositoryQualityGatesSection'

const lint = { id: 'lint', name: 'Lint', command: 'pnpm lint', required: true, timeoutSeconds: 60 }
const tests = { name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 600 }
const repo: Repo = {
  id: 'repo',
  path: '/work/app',
  displayName: 'Repo',
  badgeColor: '#000000',
  addedAt: 0,
  qualityGates: [lint]
}
const proposal: QualityGateProposal = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/work/app',
  proposedAt: 1,
  proposedBy: { kind: 'local-cli' },
  rationale: 'The project has tests',
  items: [
    { id: 'item-1', ...tests, rationale: 'Tests guard the change' },
    {
      id: 'item-2',
      gateId: 'lint',
      name: 'Lint',
      command: 'true',
      required: false,
      timeoutSeconds: 60
    }
  ]
}
const local = { kind: 'local' }
const updateRepo = vi.fn()

async function show(row: Repo = repo): Promise<void> {
  mocks.store.repos = [row]
  mocks.store.worktreesByRepo = { repo: [{ id: 'repo::/work/app', displayName: 'feature-x' }] }
  render(<RepositoryQualityGatesSection repo={row} updateRepo={updateRepo} />)
  await act(async () => {})
}

const region = (): HTMLElement | null => screen.queryByRole('region', { name: 'Proposed gates' })
const card = (itemId: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-quality-gate-proposal-item="${itemId}"]`)
  if (!found) {
    throw new Error(`no card for ${itemId}`)
  }
  return found
}

describe('RepositoryQualityGatesSection with a proposal of gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.proposalsSupported.mockResolvedValue(true)
    mocks.fetchProposal.mockResolvedValue(proposal)
    mocks.settingsSupported.mockResolvedValue(true)
    updateRepo.mockResolvedValue(true)
  })
  afterEach(cleanup)

  it('shows the proposal as new and changed gates against the gates in force', async () => {
    await show()

    expect(mocks.fetchProposal).toHaveBeenCalledWith(local, 'repo')
    const shown = region()!
    expect(within(shown).getByText(/From feature-x · 5 minutes ago/)).toBeTruthy()
    expect(within(shown).getByText('The project has tests')).toBeTruthy()

    const added = within(card('item-1'))
    expect(added.getByText('New')).toBeTruthy()
    expect(added.getByText('pnpm test')).toBeTruthy()
    expect(added.getByText('Tests guard the change')).toBeTruthy()

    const changed = within(card('item-2'))
    expect(changed.getByText('Change')).toBeTruthy()
    expect(changed.getByText('Command now')).toBeTruthy()
    expect(changed.getByText('pnpm lint')).toBeTruthy()
    expect(changed.getByText('true')).toBeTruthy()
    // Required in force, optional proposed.
    expect(changed.getByText('Required')).toBeTruthy()
    expect(changed.getAllByText('Optional')).toHaveLength(2)
  })

  it('accepts one item and keeps the rest pending, with the gates the host wrote', async () => {
    const written = [lint, { id: 'tests', ...tests }]
    mocks.answer.mockResolvedValue({
      proposal: { ...proposal, items: [proposal.items[1]] },
      gates: written
    })
    await show()

    fireEvent.click(screen.getByRole('button', { name: 'Accept Tests' }))

    await waitFor(() =>
      expect(mocks.answer).toHaveBeenCalledWith(local, 'repo', {
        proposalId: 'p1',
        action: 'accept',
        itemIds: ['item-1']
      })
    )
    await waitFor(() =>
      expect(document.querySelector('[data-quality-gate-proposal-item="item-1"]')).toBeNull()
    )
    expect(card('item-2')).toBeTruthy()
    expect(mocks.store.repos[0].qualityGates).toEqual(written)
    expect(updateRepo).not.toHaveBeenCalled()
  })

  it.each([
    ['Accept all', 'accept'],
    ['Dismiss all', 'dismiss']
  ])('%s answers every item at once', async (label, action) => {
    mocks.answer.mockResolvedValue({ proposal: null, gates: [lint] })
    await show()

    fireEvent.click(screen.getByRole('button', { name: label }))

    await waitFor(() => expect(region()).toBeNull())
    expect(mocks.answer).toHaveBeenCalledWith(local, 'repo', { proposalId: 'p1', action })
  })

  it('saves an edited item as the user own gate, then dismisses the item', async () => {
    mocks.answer.mockResolvedValue({
      proposal: { ...proposal, items: [proposal.items[1]] },
      gates: [lint]
    })
    await show()

    fireEvent.click(within(card('item-1')).getByRole('button', { name: 'Edit Tests' }))
    expect(screen.getByRole('button', { name: 'Add Gate' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'pnpm test --run' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mocks.answer).toHaveBeenCalledWith(local, 'repo', {
        proposalId: 'p1',
        action: 'dismiss',
        itemIds: ['item-1']
      })
    )
    expect(updateRepo).toHaveBeenCalledWith('repo', {
      qualityGates: [lint, { id: 'tests', ...tests, command: 'pnpm test --run' }]
    })
    expect(updateRepo.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.answer.mock.invocationCallOrder[0]
    )
  })

  it('keeps the item pending when the edited gate could not be saved', async () => {
    updateRepo.mockResolvedValue(false)
    await show()

    fireEvent.click(within(card('item-1')).getByRole('button', { name: 'Edit Tests' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('The gates could not be saved.')).toBeTruthy()
    expect(mocks.answer).not.toHaveBeenCalled()
  })

  it('says so when the edited gate was saved but the item could not be dismissed', async () => {
    mocks.answer.mockRejectedValue(new Error('runtime_timeout'))
    await show()

    fireEvent.click(within(card('item-1')).getByRole('button', { name: 'Edit Tests' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Your gate was saved, but the item could not be dismissed.')
    ).toBeTruthy()
    expect(updateRepo).toHaveBeenCalledTimes(1)
    // Read again, so what the host holds is what is shown.
    await waitFor(() => expect(mocks.fetchProposal).toHaveBeenCalledTimes(2))
  })

  it('shows the host refusal and reads the proposal again', async () => {
    mocks.answer.mockRejectedValue(new Error('This proposal is no longer pending.'))
    await show()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Tests' }))

    expect(await screen.findByText('This proposal is no longer pending.')).toBeTruthy()
    await waitFor(() => expect(mocks.fetchProposal).toHaveBeenCalledTimes(2))
  })

  it('shows and answers the proposal of a folder without git the same way', async () => {
    mocks.answer.mockResolvedValue({ proposal: null, gates: [lint] })
    await show({ ...repo, kind: 'folder' })

    expect(card('item-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }))

    await waitFor(() =>
      expect(mocks.answer).toHaveBeenCalledWith(local, 'repo', {
        proposalId: 'p1',
        action: 'dismiss'
      })
    )
  })

  it('takes no item whose name another gate holds until it is edited', async () => {
    mocks.fetchProposal.mockResolvedValue({
      ...proposal,
      items: [{ id: 'item-1', ...tests, name: 'lint' }]
    })
    await show()

    expect(screen.getByRole('button', { name: 'Accept lint' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Accept all' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Another gate already has this name/)).toBeTruthy()
  })
})

describe('RepositoryQualityGatesSection with a proposal on another host', () => {
  const onHost: Repo = { ...repo, executionHostId: 'runtime:env-1' }
  const host = { kind: 'environment', environmentId: 'env-1' }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchProposal.mockResolvedValue(proposal)
    mocks.settingsSupported.mockResolvedValue(true)
  })
  afterEach(cleanup)

  it('reads and answers on the host that keeps the repository', async () => {
    mocks.proposalsSupported.mockResolvedValue(true)
    const written = [lint, { id: 'tests', ...tests }]
    mocks.answer.mockResolvedValue({ proposal: null, gates: written })
    await show(onHost)
    mocks.store.repos.push({ ...repo, qualityGates: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }))

    await waitFor(() =>
      expect(mocks.answer).toHaveBeenCalledWith(host, 'repo', {
        proposalId: 'p1',
        action: 'accept'
      })
    )
    expect(mocks.proposalsSupported).toHaveBeenCalledWith(host)
    expect(mocks.fetchProposal).toHaveBeenCalledWith(host, 'repo')
    // That host's row took the gates; this app's row with the same id did not.
    await waitFor(() => expect(mocks.store.repos[0].qualityGates).toEqual(written))
    expect(mocks.store.repos[1].qualityGates).toEqual([])
  })

  it('shows nothing and reads nothing when the host keeps no proposals', async () => {
    mocks.proposalsSupported.mockResolvedValue(false)
    await show(onHost)

    expect(mocks.fetchProposal).not.toHaveBeenCalled()
    expect(region()).toBeNull()
  })

  it('never asks a host reached over plain SSH, where no gate runs', async () => {
    await show({ ...repo, connectionId: 'ssh-box' })

    expect(mocks.proposalsSupported).not.toHaveBeenCalled()
    expect(mocks.fetchProposal).not.toHaveBeenCalled()
    expect(region()).toBeNull()
  })
})
