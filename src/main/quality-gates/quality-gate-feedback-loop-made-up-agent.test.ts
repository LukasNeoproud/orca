import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ParsedAgentStatusPayload } from '../../shared/agent-status-types'
import type { QualityGateDefinition } from '../../shared/quality-gate-types'
import type { EnrichedAgentHookEventPayload } from '../agent-hooks/server/server-types'
import { runQualityGateCommand } from './quality-gate-command-run'
import { createQualityGateFeedbackLoop } from './quality-gate-feedback-loop'
import { createQualityGateLoopAgentEvents } from './quality-gate-loop-agent-events'
import { createQualityGateRunStore } from './quality-gate-run-store'
import { createQualityGateService } from './quality-gate-service'
import { readQualityGateSourceState } from './quality-gate-source-state'
import type { QualityGateTarget } from './quality-gate-target'

const WORKTREE = 'repo::/work'
const build: QualityGateDefinition = {
  id: 'build',
  name: 'Build',
  command: 'test -f fixed.txt || { echo "error: main.kt:3 unresolved reference" >&2; exit 2; }',
  required: true,
  timeoutSeconds: 30
}

/**
 * The whole path with real gate commands and an agent that exists only as the status rows a hook
 * server would publish for it: no agent CLI is started.
 */
describe.skipIf(process.platform === 'win32')('feedback loop with a made-up agent', () => {
  let root: string
  let worktree: string
  let clock: number
  let inbox: string[]
  let onMessage: (text: string) => void
  let observe: (
    payload: Partial<ParsedAgentStatusPayload> & Pick<ParsedAgentStatusPayload, 'state'>,
    extra?: Partial<EnrichedAgentHookEventPayload>
  ) => Promise<void>
  let loopStatus: () => ReturnType<ReturnType<typeof createQualityGateFeedbackLoop>['status']>
  let gateStatus: () => Promise<(string | null)[]>
  let changes: number

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-gate-loop-agent-')))
    worktree = join(root, 'worktree')
    mkdirSync(worktree)
    clock = 0
    inbox = []
    changes = 0
    onMessage = () => {}
    let nextRun = 0
    const service = createQualityGateService({
      store: createQualityGateRunStore({ filePath: join(root, 'data', 'runs.json') }),
      hostInstanceId: 'host-a',
      runCommand: runQualityGateCommand,
      readSource: readQualityGateSourceState,
      runnerDirectory: join(root, 'data', 'runners'),
      now: Date.now,
      newRunId: () => `run-${++nextRun}`
    })
    const target: QualityGateTarget = {
      repoId: 'repo',
      worktreeId: WORKTREE,
      worktreePath: worktree,
      gates: [build],
      feedbackLoop: { enabled: true, maxRounds: 3 },
      launch: { kind: 'native', cwd: worktree },
      source: { path: worktree, git: false }
    }
    const loop = createQualityGateFeedbackLoop({
      resolveTarget: async () => target,
      service,
      isWorkspaceDisabled: () => false,
      deliver: async (_agent, text) => {
        inbox.push(text)
        onMessage(text)
        return { kind: 'sent' }
      },
      onChanged: () => {
        changes += 1
      },
      newChainId: () => 'qg-made-up'
    })
    const events = createQualityGateLoopAgentEvents()
    observe = async (payload, extra = {}) => {
      clock += 1
      const event = events.observe({
        paneKey: 'tab:leaf',
        worktreeId: WORKTREE,
        connectionId: null,
        receivedAt: clock,
        stateStartedAt: clock,
        terminalHandle: 'term-1',
        payload: { prompt: '', agentType: 'claude', ...payload },
        ...extra
      })
      if (event) {
        await loop.handle(event)
      }
    }
    loopStatus = () => loop.status(target)
    gateStatus = async () =>
      (await service.status(target)).gates.map((entry) => entry.latestRun?.status ?? null)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('tells the agent what failed, and is satisfied once the agent fixed it', async () => {
    // The made-up agent reads the message, fixes the build and ends its turn.
    onMessage = () => writeFileSync(join(worktree, 'fixed.txt'), 'fixed')

    await observe({ state: 'working', prompt: 'add the screen' }, { turnStartedAt: 1 })
    await observe({ state: 'done' }, { turnStartedAt: 1 })

    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toContain('round 1 of 3')
    expect(inbox[0]).toContain('"name": "Build"')
    expect(inbox[0]).toContain('error: main.kt:3 unresolved reference')
    expect(inbox[0]).toContain('"exitCode": 2')
    expect(await gateStatus()).toEqual(['failed'])
    expect(loopStatus()).toMatchObject({ state: 'awaiting-agent', round: 1 })
    expect(existsSync(join(worktree, 'fixed.txt'))).toBe(true)

    await observe(
      { state: 'working', prompt: inbox[0].split('\n')[0] },
      { turnStartedAt: 5, hasExplicitPrompt: true }
    )
    expect(loopStatus().state).toBe('awaiting-agent')
    // A subagent of the fixing turn ends: no second check.
    await observe({ state: 'working' }, { turnStartedAt: 5, toolAgentId: 'sub-1' })
    await observe({ state: 'done' }, { turnStartedAt: 5 })

    expect(inbox).toHaveLength(1)
    expect(await gateStatus()).toEqual(['passed'])
    expect(loopStatus()).toMatchObject({ state: 'passed', round: 1, failingGateIds: [] })
    expect(changes).toBeGreaterThan(0)
  })

  it('hands the failures to the user when the agent keeps failing the same way', async () => {
    await observe({ state: 'working' }, { turnStartedAt: 1 })
    await observe({ state: 'done' }, { turnStartedAt: 1 })
    await observe(
      { state: 'working', prompt: inbox[0].split('\n')[0] },
      { turnStartedAt: 5, hasExplicitPrompt: true }
    )
    await observe({ state: 'done' }, { turnStartedAt: 5 })

    expect(inbox).toHaveLength(1)
    expect(loopStatus()).toMatchObject({
      state: 'needs-user',
      stopReason: 'no-improvement',
      failingGateIds: ['build']
    })
  })
})
