/**
 * A unit of work: one branch of the user in one repository with the workspace, pull request and
 * ticket that belong to it, and the phase and stall derived from them.
 */

import type { ExecutionHostId } from '../execution-host'
import { forgetWorkFact, type WorkFact } from './work-fact'
import type { WorkFlowSettings } from './work-flow-settings'
import { deriveWorkPhase, type WorkPhaseVerdict } from './work-phase'
import { deriveWorkStall, type WorkStall } from './work-stall'
import type { WorkTicketKeySource } from './work-ticket-key'
import type {
  WorkBranch,
  WorkPullRequest,
  WorkRelease,
  WorkReleaseStage,
  WorkTicket
} from './work-unit-facts'
import { systemWallClockOffset, type WallClockOffset } from './working-day-deadline'

export type WorkUnitTicket = {
  key: string
  source: WorkTicketKeySource
  ticket: WorkFact<WorkTicket>
}

export type WorkUnitRepository = {
  /** Shared by every clone of the repository, so a unit seen from two hosts is one unit. */
  key: string
  /** As the reader addresses the host that leads the repository; null when no host has it. */
  hostId: ExecutionHostId | null
  repoId: string | null
  name: string
}

/** What the sources said about one branch, before anything is derived. */
export type WorkUnitFacts = {
  repository: WorkUnitRepository
  branch: string
  worktreeId: string | null
  /** Null for a pull request whose branch has no workspace. */
  branchFacts: WorkFact<WorkBranch> | null
  /** A known null is a branch without a pull request. */
  pullRequest: WorkFact<WorkPullRequest | null>
  /** Null when nothing names a ticket. */
  ticket: WorkUnitTicket | null
  release: WorkRelease
}

export type WorkUnit = WorkUnitFacts & {
  id: string
  phase: Exclude<WorkPhaseVerdict, { kind: 'not-work' }>
  stall: WorkStall
}

/** A branch reused for a second pull request is a second unit, so the number is part of the id. */
export function workUnitId(
  repositoryKey: string,
  branch: string,
  pullRequestNumber: number | null
): string {
  return JSON.stringify([repositoryKey, branch, pullRequestNumber])
}

function pullRequestNumberOf(pullRequest: WorkFact<WorkPullRequest | null>): number | null {
  const value = pullRequest.known ? pullRequest.value : pullRequest.lastKnown
  // An abandoned pull request no longer defines the unit; its branch does.
  return value && value.state !== 'closed' ? value.number : null
}

/** Null when the facts describe no work of the user, e.g. a branch without commits of its own. */
export function composeWorkUnit(
  facts: WorkUnitFacts,
  settings: WorkFlowSettings,
  nowMs: number,
  offset: WallClockOffset = systemWallClockOffset
): WorkUnit | null {
  const phase = deriveWorkPhase({
    branch: facts.branchFacts,
    pullRequest: facts.pullRequest,
    release: facts.release
  })
  if (phase.kind === 'not-work') {
    return null
  }
  return {
    ...facts,
    id: workUnitId(facts.repository.key, facts.branch, pullRequestNumberOf(facts.pullRequest)),
    phase,
    stall: deriveWorkStall(phase, settings, nowMs, offset)
  }
}

/** The same unit under the deadlines and the calendar of the app the user sits at. */
export function restallWorkUnit(
  unit: WorkUnit,
  settings: WorkFlowSettings,
  nowMs: number,
  offset: WallClockOffset = systemWallClockOffset
): WorkUnit {
  return { ...unit, stall: deriveWorkStall(unit.phase, settings, nowMs, offset) }
}

function unreachableStage(stage: WorkReleaseStage): WorkReleaseStage {
  // A stage that is off is a setting, not something the host observed.
  return stage.state === 'off' ? stage : { state: 'unknown', reason: 'host-unreachable' }
}

/**
 * A unit whose host stopped answering: what the host said stays for display, the phase is unknown
 * and nothing is stalled. The ticket stays, because the app the user sits at reads it.
 */
export function workUnitOfUnreachableHost(unit: WorkUnit): WorkUnit {
  const pullRequest = forgetWorkFact(unit.pullRequest, 'host-unreachable')
  return {
    ...unit,
    branchFacts: unit.branchFacts && forgetWorkFact(unit.branchFacts, 'host-unreachable'),
    pullRequest,
    release: {
      production: unreachableStage(unit.release.production),
      dev: unreachableStage(unit.release.dev)
    },
    phase: { kind: 'unknown', missing: 'pull-request', reason: 'host-unreachable' },
    stall: { kind: 'unknown' }
  }
}
