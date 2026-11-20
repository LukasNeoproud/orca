// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { QualityGateStatusView } from './quality-gate-status-view'
import { getRepositoryQualityGatesSectionId } from './quality-gate-settings-target'

const mocks = vi.hoisted(() => {
  const state: {
    view: QualityGateStatusView | null
    target: RuntimeClientTarget | null
    repo: { id: string; qualityGates?: unknown }
    statusArgs: unknown[][]
  } = {
    view: null,
    target: { kind: 'local' },
    repo: { id: 'repo', qualityGates: [] },
    statusArgs: []
  }
  return Object.assign(state, {
    refresh: vi.fn(),
    startQualityGates: vi.fn(),
    cancelQualityGates: vi.fn(),
    setQualityGateFeedbackLoop: vi.fn(),
    fetchQualityGateOutput: vi.fn(),
    classifyQualityGateCallFailure: vi.fn(() => 'refused'),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn()
  })
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(value\d)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      getKnownWorktreeById: () => ({ repoId: 'repo' }),
      openSettingsTarget: mocks.openSettingsTarget,
      openSettingsPage: mocks.openSettingsPage
    })
}))
vi.mock('@/store/selectors', () => ({ useRepoById: () => mocks.repo }))
vi.mock('../right-sidebar/worktree-git-owner-target', () => ({
  useWorktreeGitOwnerTarget: () => mocks.target
}))
vi.mock('@/lib/quality-gate-client', () => ({
  startQualityGates: mocks.startQualityGates,
  cancelQualityGates: mocks.cancelQualityGates,
  setQualityGateFeedbackLoop: mocks.setQualityGateFeedbackLoop,
  fetchQualityGateOutput: mocks.fetchQualityGateOutput,
  classifyQualityGateCallFailure: mocks.classifyQualityGateCallFailure
}))
vi.mock('./use-quality-gate-status', () => ({
  useQualityGateStatus: (...args: unknown[]) => {
    mocks.statusArgs.push(args)
    return { view: mocks.view, refresh: mocks.refresh }
  }
}))

import {
  feedbackLoopStatus,
  gateRun,
  gateStatus,
  liveGateRun
} from './quality-gate-status-test-fixtures'
import { emptyQualityGateStatusView } from './quality-gate-status-view'
import { WorkspaceQualityGatesSection } from './WorkspaceQualityGatesSection'

const WORKTREE = 'repo::/work'

function show(view: Partial<QualityGateStatusView>, visible = true) {
  mocks.view = { ...emptyQualityGateStatusView('local\0repo::/work'), ...view }
  return render(<WorkspaceQualityGatesSection worktreeId={WORKTREE} visible={visible} />)
}

function row(gateId: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-workspace-quality-gate="${gateId}"]`)
  if (!found) {
    throw new Error(`no row for ${gateId}`)
  }
  return found
}

describe('WorkspaceQualityGatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.statusArgs = []
    mocks.target = { kind: 'local' }
    mocks.repo = { id: 'repo', qualityGates: [] }
    mocks.startQualityGates.mockResolvedValue({ runs: [] })
    mocks.cancelQualityGates.mockResolvedValue({ cancelled: [] })
    mocks.setQualityGateFeedbackLoop.mockResolvedValue({ feedbackLoop: feedbackLoopStatus() })
    mocks.fetchQualityGateOutput.mockResolvedValue({
      run: gateRun({ outputTruncated: true }),
      stdout: 'last line of the build\n',
      stderr: ''
    })
  })

  afterEach(cleanup)

  it('shows each gate with its result, time, commit and freshness', () => {
    show({
      status: gateStatus(
        gateRun(),
        gateRun({
          status: 'failed',
          exitCode: 2,
          source: { head: 'bbb2223334445556', clean: false, fingerprint: 'f1' },
          freshness: { state: 'stale', reasons: ['head-changed'] }
        }),
        null
      )
    })

    expect(screen.getByRole('heading', { name: 'Local gates' })).toBeTruthy()
    const passed = within(row('gate-0'))
    expect(passed.getByText('Gate 0')).toBeTruthy()
    expect(passed.getByText('Passed')).toBeTruthy()
    expect(passed.getByText('aaa1112223')).toBeTruthy()
    expect(passed.getByText('Up to date')).toBeTruthy()
    expect(row('gate-0').querySelector('time')?.getAttribute('datetime')).toBe(
      new Date(5_500).toISOString()
    )

    const failed = within(row('gate-1'))
    expect(failed.getByText('Failed')).toBeTruthy()
    expect(failed.getByText('exit code 2')).toBeTruthy()
    expect(failed.getByText('bbb2223334')).toBeTruthy()
    expect(failed.getByText('with uncommitted changes')).toBeTruthy()
    expect(failed.getByText('Out of date: another commit')).toBeTruthy()
    // Gate 1 is optional in the fixture; a required gate carries no badge.
    expect(failed.getByText('Optional')).toBeTruthy()
    expect(passed.queryByText('Optional')).toBeNull()

    expect(within(row('gate-2')).getByText('Not run in this workspace yet')).toBeTruthy()
    expect(document.querySelector('[data-workspace-quality-gates-summary]')?.textContent).toBe(
      '1 out of date · 1 passed · 1 not run'
    )
  })

  it('opens the end of the output of a finished run on demand', async () => {
    show({ status: gateStatus(gateRun()) })
    expect(mocks.fetchQualityGateOutput).not.toHaveBeenCalled()

    fireEvent.click(within(row('gate-0')).getByRole('button', { name: 'Output' }))

    await waitFor(() => expect(screen.getByText(/last line of the build/)).toBeTruthy())
    expect(mocks.fetchQualityGateOutput).toHaveBeenCalledWith({ kind: 'local' }, WORKTREE, 'run-1')
    expect(screen.getByText('Only the end of the output is kept.')).toBeTruthy()
  })

  it('runs all gates, runs one gate, and re-reads the status after each request', async () => {
    show({ status: gateStatus(gateRun(), null) })

    fireEvent.click(screen.getByRole('button', { name: 'Run all' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
    expect(mocks.startQualityGates).toHaveBeenLastCalledWith({ kind: 'local' }, WORKTREE)

    fireEvent.click(screen.getByRole('button', { name: 'Run Gate 1' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2))
    expect(mocks.startQualityGates).toHaveBeenLastCalledWith({ kind: 'local' }, WORKTREE, [
      'gate-1'
    ])
  })

  it('offers Stop while a gate runs: for everything, or for that gate alone', async () => {
    show({ status: gateStatus(liveGateRun(), gateRun()) })
    expect(screen.queryByRole('button', { name: 'Run all' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stop Gate 0' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
    expect(mocks.cancelQualityGates).toHaveBeenLastCalledWith({ kind: 'local' }, WORKTREE, 'gate-0')

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2))
    expect(mocks.cancelQualityGates).toHaveBeenLastCalledWith({ kind: 'local' }, WORKTREE)
  })

  it('shows a stopped run without freshness, and names quit as the reason', () => {
    show({
      status: gateStatus(
        // An older host still calls a stopped run up to date and has only the English text.
        gateRun({
          status: 'cancelled',
          exitCode: null,
          freshness: { state: 'current' },
          error: 'Stopped because Orca quit while the gate was running.'
        }),
        gateRun({
          status: 'cancelled',
          exitCode: null,
          freshness: null,
          stopReason: 'app-quit',
          error: 'Stopped because Orca quit while the gate was running.'
        })
      )
    })

    for (const gateId of ['gate-0', 'gate-1']) {
      const stopped = within(row(gateId))
      expect(stopped.getByText('Stopped')).toBeTruthy()
      expect(stopped.queryByText('Up to date')).toBeNull()
      expect(
        stopped.getByText('Stopped because Orca quit while the gate was running.')
      ).toBeTruthy()
    }
  })

  it('reads from the remote host of an SSH workspace and shows a lost run as unknown, not failed', () => {
    mocks.target = { kind: 'environment', environmentId: 'env-ssh' }
    show({ status: gateStatus(liveGateRun(), gateRun()), contactLost: true })

    expect(mocks.statusArgs.at(-1)).toEqual([
      { kind: 'environment', environmentId: 'env-ssh' },
      WORKTREE,
      '[]',
      { watch: true }
    ])
    expect(within(row('gate-0')).getByText('Outcome unknown')).toBeTruthy()
    expect(screen.queryByText('Failed')).toBeNull()
    expect(within(row('gate-1')).getByText('Passed')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('did not answer')
    // Nothing can be started on a host that does not answer, and nothing is known to be running.
    expect(screen.getByRole('button', { name: 'Run all' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Run Gate 0' }).hasAttribute('disabled')).toBe(true)
  })

  it('says so when the host predates gates or refuses, instead of showing a failed gate', () => {
    show({ unsupported: true })
    expect(screen.getByRole('status').textContent).toContain('does not support quality gates')
    cleanup()

    show({ error: 'The host that owns this workspace could not be resolved.' })
    expect(screen.getByRole('alert').textContent).toBe(
      'The host that owns this workspace could not be resolved.'
    )
  })

  it('shows what the host refused when a run could not be requested', async () => {
    mocks.startQualityGates.mockRejectedValue(new Error('Orca is quitting'))
    show({ status: gateStatus(null) })

    fireEvent.click(screen.getByRole('button', { name: 'Run all' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Orca is quitting'))
  })

  it('leads to the quality gates section of the repository settings when no gate is set up', () => {
    show({ status: gateStatus() })
    expect(screen.queryByRole('button', { name: 'Run all' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Set up gates' }))

    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'repo',
      repoId: 'repo',
      sectionId: getRepositoryQualityGatesSectionId('repo')
    })
    expect(mocks.openSettingsPage).toHaveBeenCalledTimes(1)
  })

  it('reads nothing while the panel is hidden and re-reads when the gates are edited', () => {
    mocks.repo = { id: 'repo', qualityGates: [{ id: 'lint' }] }
    show({}, false)

    expect(mocks.statusArgs.at(-1)).toEqual([null, WORKTREE, '[{"id":"lint"}]', { watch: true }])
  })

  it('renders nothing without a workspace or a host to ask', () => {
    mocks.target = null
    const { container } = show({ status: gateStatus(gateRun()) })
    expect(container.innerHTML).toBe('')
  })

  describe('feedback loop', () => {
    const loopRow = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-workspace-quality-gate-feedback-loop]')
    const loopText = (text: string): HTMLElement => {
      const found = loopRow()
      if (!found) {
        throw new Error('no feedback loop row')
      }
      return within(found).getByText(text)
    }
    const loopSwitch = (): HTMLElement =>
      screen.getByRole('switch', { name: 'Feedback loop in this workspace' })
    const withLoop = (loop: Parameters<typeof feedbackLoopStatus>[0], runs = [gateRun()]) => ({
      ...gateStatus(...runs),
      feedbackLoop: feedbackLoopStatus(loop)
    })

    it('shows the round in progress next to a switch that is on', () => {
      show({ status: withLoop({ state: 'awaiting-agent', round: 1 }) })

      expect(loopRow()?.dataset.workspaceQualityGateFeedbackLoop).toBe('active')
      expect(loopText("Round 1 of 3: waiting for the agent's fix")).toBeTruthy()
      expect(loopSwitch().getAttribute('aria-checked')).toBe('true')
    })

    it('says when findings wait for the user, and when the loop passed', () => {
      show({
        status: withLoop({ state: 'needs-user', round: 3, stopReason: 'round-limit' }, [
          gateRun({ status: 'failed', exitCode: 1 })
        ])
      })
      expect(loopText('Findings wait for you: the round limit was reached')).toBeTruthy()
      cleanup()

      show({ status: withLoop({ state: 'passed', round: 1 }) })
      expect(loopText('Passed after round 1 of 3')).toBeTruthy()
    })

    it('turns the loop off for the workspace on its own host, then re-reads the status', async () => {
      show({ status: withLoop({ state: 'checking', round: 1 }) })

      fireEvent.click(loopSwitch())

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
      expect(mocks.setQualityGateFeedbackLoop).toHaveBeenCalledWith(
        { kind: 'local' },
        WORKTREE,
        false
      )
      // The switch holds the request until a status read shows the host took it.
      expect(loopSwitch().getAttribute('aria-checked')).toBe('false')
    })

    it('turns it back on in an SSH workspace through the host that owns it', async () => {
      mocks.target = { kind: 'environment', environmentId: 'env-ssh' }
      show({ status: withLoop({ enabled: false, workspaceDisabled: true, state: 'stopped' }) })
      expect(loopText('Off in this workspace')).toBeTruthy()
      expect(loopSwitch().getAttribute('aria-checked')).toBe('false')

      fireEvent.click(loopSwitch())

      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
      expect(mocks.setQualityGateFeedbackLoop).toHaveBeenCalledWith(
        { kind: 'environment', environmentId: 'env-ssh' },
        WORKTREE,
        true
      )
    })

    it('shows what the host refused and lets the switch fall back', async () => {
      mocks.setQualityGateFeedbackLoop.mockRejectedValue(
        new Error('The feedback loop of a workspace can only be turned back on in the Orca app.')
      )
      show({ status: withLoop({ enabled: false, workspaceDisabled: true, state: 'idle' }) })

      fireEvent.click(loopSwitch())

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain('only be turned back on')
      )
      expect(loopSwitch().getAttribute('aria-checked')).toBe('false')
    })

    it('reads an SSH host that stopped answering as unknown and offers no switch to flip', () => {
      mocks.target = { kind: 'environment', environmentId: 'env-ssh' }
      show({
        status: withLoop({ state: 'awaiting-agent', round: 2 }, [liveGateRun()]),
        contactLost: true
      })

      expect(loopRow()?.dataset.workspaceQualityGateFeedbackLoop).toBe('unknown')
      expect(loopText('Unknown until the host answers')).toBeTruthy()
      expect(loopSwitch().hasAttribute('disabled')).toBe(true)
    })

    it('shows nothing for a host without the loop, a repository with it off, or no gates', () => {
      show({ status: gateStatus(gateRun()) })
      expect(loopRow()).toBeNull()
      cleanup()

      show({ status: withLoop({ repoEnabled: false, enabled: false }) })
      expect(loopRow()).toBeNull()
      cleanup()

      show({ status: { ...gateStatus(), feedbackLoop: feedbackLoopStatus() } })
      expect(loopRow()).toBeNull()
    })
  })
})
