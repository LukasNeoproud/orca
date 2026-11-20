// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateProposal } from '../../../../shared/quality-gate-proposal'
import type { Repo } from '../../../../shared/repo-types'
import { getRepositoryQualityGatesSectionId } from './quality-gate-settings-target'

const mocks = vi.hoisted(() => {
  const state: { proposal: QualityGateProposal | null; hookArgs: unknown[][] } = {
    proposal: null,
    hookArgs: []
  }
  return Object.assign(state, { openSettingsTarget: vi.fn(), openSettingsPage: vi.fn() })
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(value\d)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      openSettingsTarget: mocks.openSettingsTarget,
      openSettingsPage: mocks.openSettingsPage
    })
}))
vi.mock('./use-pending-quality-gate-proposal', () => ({
  usePendingQualityGateProposal: (...args: unknown[]) => {
    mocks.hookArgs.push(args)
    return { proposal: mocks.proposal }
  }
}))

import { WorkspaceQualityGateProposalNotice } from './WorkspaceQualityGateProposalNotice'

const repo: Repo = {
  id: 'repo',
  path: '/srv/app',
  displayName: 'Repo',
  badgeColor: '#000000',
  addedAt: 0,
  executionHostId: 'runtime:env-1'
}
const proposal: QualityGateProposal = {
  id: 'p1',
  repoId: 'repo',
  worktreeId: 'repo::/srv/app',
  proposedAt: 1,
  proposedBy: { kind: 'local-cli' },
  items: [
    { id: 'item-1', name: 'Tests', command: 'pnpm test', required: true, timeoutSeconds: 60 },
    { id: 'item-2', name: 'Build', command: 'pnpm build', required: true, timeoutSeconds: 60 }
  ]
}

describe('WorkspaceQualityGateProposalNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hookArgs = []
    mocks.proposal = proposal
  })
  afterEach(cleanup)

  it('says proposed gates wait and opens them in the settings of that host', () => {
    render(<WorkspaceQualityGateProposalNotice repo={repo} visible />)

    expect(screen.getByRole('status').textContent).toBe('Proposed gates wait for your review: 2')
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'repo',
      repoId: 'repo',
      hostId: 'runtime:env-1',
      sectionId: getRepositoryQualityGatesSectionId('repo')
    })
    expect(mocks.openSettingsPage).toHaveBeenCalled()
  })

  it('shows nothing when no proposal waits', () => {
    mocks.proposal = null
    const { container } = render(<WorkspaceQualityGateProposalNotice repo={repo} visible />)

    expect(container.textContent).toBe('')
  })

  it('reads only while the panel is shown', () => {
    render(<WorkspaceQualityGateProposalNotice repo={repo} visible={false} />)

    expect(mocks.hookArgs).toEqual([[repo, false]])
  })
})
