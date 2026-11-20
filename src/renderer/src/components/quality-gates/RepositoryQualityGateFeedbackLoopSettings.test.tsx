// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QualityGateDefinition } from '../../../../shared/quality-gate-types'
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

import { RepositoryQualityGateFeedbackLoopSettings } from './RepositoryQualityGateFeedbackLoopSettings'

const lint: QualityGateDefinition = {
  id: 'lint',
  name: 'Lint',
  command: 'pnpm lint',
  required: true,
  timeoutSeconds: 60
}

function repoWith(qualityGateFeedbackLoop?: Repo['qualityGateFeedbackLoop']): Repo {
  return {
    id: 'repo',
    path: '/work',
    displayName: 'Repo',
    badgeColor: '#000000',
    addedAt: 0,
    qualityGates: [lint],
    ...(qualityGateFeedbackLoop ? { qualityGateFeedbackLoop } : {})
  }
}

function show(repo: Repo, gates: QualityGateDefinition[] = [lint]) {
  const updateRepo = vi.fn().mockResolvedValue(true)
  render(
    <RepositoryQualityGateFeedbackLoopSettings repo={repo} gates={gates} updateRepo={updateRepo} />
  )
  return updateRepo
}

const loopSwitch = (): HTMLElement => screen.getByRole('switch', { name: 'Feedback loop' })

describe('RepositoryQualityGateFeedbackLoopSettings', () => {
  afterEach(cleanup)

  it('is off by default, says it spends the agent tokens, and hides the round limit', () => {
    show(repoWith())

    expect(loopSwitch().getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/Each message uses the agent's tokens\./)).toBeTruthy()
    expect(screen.queryByRole('spinbutton', { name: 'Rounds' })).toBeNull()
  })

  it('turns the loop on with three rounds', async () => {
    const updateRepo = show(repoWith())

    fireEvent.click(loopSwitch())

    await waitFor(() =>
      expect(updateRepo).toHaveBeenCalledWith('repo', {
        qualityGateFeedbackLoop: { enabled: true, maxRounds: 3 }
      })
    )
  })

  it('saves a round limit within 1 to 10 once the loop is on', async () => {
    const updateRepo = show(repoWith({ enabled: true, maxRounds: 3 }))
    const rounds = screen.getByRole('spinbutton', { name: 'Rounds' })
    expect(rounds.getAttribute('min')).toBe('1')
    expect(rounds.getAttribute('max')).toBe('10')

    fireEvent.change(rounds, { target: { value: '25' } })
    fireEvent.blur(rounds)

    await waitFor(() =>
      expect(updateRepo).toHaveBeenCalledWith('repo', {
        qualityGateFeedbackLoop: { enabled: true, maxRounds: 10 }
      })
    )
  })

  it('says the loop has nothing to run when no gate is required', () => {
    show(repoWith({ enabled: true, maxRounds: 3 }), [{ ...lint, required: false }])
    expect(screen.getByRole('status').textContent).toBe(
      'No gate is required, so the loop has nothing to run.'
    )
  })

  it('says so when the setting could not be saved', async () => {
    const updateRepo = show(repoWith())
    updateRepo.mockResolvedValue(false)

    fireEvent.click(loopSwitch())

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'The feedback loop setting could not be saved.'
      )
    )
  })
})
