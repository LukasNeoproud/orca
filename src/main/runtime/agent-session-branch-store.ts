import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  isAgentSessionBranchRecord,
  isAgentSessionReturnArtifact,
  type AgentSessionBranchRecord,
  type AgentSessionReturnArtifact
} from '../../shared/agent-session-branch'
import type {
  AgentSessionBranchNotice,
  AgentSessionBranchProposal,
  AgentSessionBranchSuggestionPreference
} from '../../shared/agent-session-branch-proposal'
import {
  agentSessionScopeKey,
  type AgentSessionExecutionLocation
} from '../../shared/agent-session-record'
import { durableWriteTempPath, renameDurable, writeTempFileDurable } from '../durable-file-write'

const FILE_NAME = 'agent-session-branches.json'

type State = {
  schemaVersion: 1
  branches: AgentSessionBranchRecord[]
  returns: AgentSessionReturnArtifact[]
  proposals: AgentSessionBranchProposal[]
  notices: AgentSessionBranchNotice[]
  preferences: Record<string, boolean>
}

function emptyState(): State {
  return {
    schemaVersion: 1,
    branches: [],
    returns: [],
    proposals: [],
    notices: [],
    preferences: {}
  }
}

async function load(filePath: string): Promise<State> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyState()
    }
    throw error
  }
  const state = parsed as Partial<State>
  if (
    state.schemaVersion !== 1 ||
    !Array.isArray(state.branches) ||
    !state.branches.every(isAgentSessionBranchRecord) ||
    !Array.isArray(state.returns) ||
    !state.returns.every(isAgentSessionReturnArtifact)
  ) {
    throw new Error('agent_session_branch_store_corrupt')
  }
  return {
    ...(state as State),
    proposals: Array.isArray(state.proposals) ? state.proposals : [],
    notices: Array.isArray(state.notices) ? state.notices : [],
    preferences: state.preferences && typeof state.preferences === 'object' ? state.preferences : {}
  }
}

export class AgentSessionBranchStore {
  private queue = Promise.resolve()
  private readonly exclusive = new Map<string, Promise<unknown>>()

  private constructor(
    private readonly filePath: string,
    private readonly state: State
  ) {}

  static async open(directory: string): Promise<AgentSessionBranchStore> {
    const filePath = join(directory, FILE_NAME)
    return new AgentSessionBranchStore(filePath, await load(filePath))
  }

  get(branchId: string): AgentSessionBranchRecord | null {
    return this.state.branches.find((branch) => branch.branchId === branchId) ?? null
  }

  allBranches(): AgentSessionBranchRecord[] {
    return [...this.state.branches]
  }

  family(sessionId: string): AgentSessionBranchRecord[] {
    const family = new Set([sessionId])
    let changed = true
    while (changed) {
      changed = false
      for (const branch of this.state.branches) {
        if (!family.has(branch.source.sessionId) && !family.has(branch.target.sessionId)) {
          continue
        }
        for (const id of [branch.source.sessionId, branch.target.sessionId]) {
          if (!family.has(id)) {
            family.add(id)
            changed = true
          }
        }
      }
    }
    return this.state.branches.filter(
      (branch) => family.has(branch.source.sessionId) || family.has(branch.target.sessionId)
    )
  }

  returnsFor(sessionId: string): AgentSessionReturnArtifact[] {
    return this.state.returns.filter(
      (item) => item.sourceSessionId === sessionId || item.targetSessionId === sessionId
    )
  }

  getReturn(returnId: string): AgentSessionReturnArtifact | null {
    return this.state.returns.find((item) => item.returnId === returnId) ?? null
  }

  proposalFor(sessionId: string): AgentSessionBranchProposal | null {
    return (
      this.state.proposals
        .filter((proposal) => proposal.sourceSessionId === sessionId)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
    )
  }

  putProposal(
    proposal: AgentSessionBranchProposal,
    expectedRevision: number
  ): Promise<AgentSessionBranchProposal> {
    return this.transact(async () => {
      const index = this.state.proposals.findIndex(
        (item) => item.proposalId === proposal.proposalId
      )
      const current = index === -1 ? null : this.state.proposals[index]!
      if (
        (current?.revision ?? 0) !== expectedRevision ||
        proposal.revision !== expectedRevision + 1
      ) {
        throw new Error('agent_session_branch_proposal_stale')
      }
      if (index === -1) {
        this.state.proposals.push(proposal)
      } else {
        this.state.proposals[index] = proposal
      }
      await this.persist()
      return proposal
    })
  }

  preferenceFor(
    sessionId: string,
    location: AgentSessionExecutionLocation
  ): AgentSessionBranchSuggestionPreference {
    const keys = [
      [`session:${sessionId}`, 'session'],
      [`workspace:${agentSessionScopeKey(location)}`, 'workspace'],
      ['global', 'global']
    ] as const
    for (const [key, source] of keys) {
      const enabled = this.state.preferences[key]
      if (typeof enabled === 'boolean') {
        return { enabled, source }
      }
    }
    return { enabled: true, source: 'default' }
  }

  setPreference(
    scope: 'session' | 'workspace' | 'global',
    sessionId: string,
    location: AgentSessionExecutionLocation,
    enabled: boolean
  ): Promise<void> {
    const key =
      scope === 'session'
        ? `session:${sessionId}`
        : scope === 'workspace'
          ? `workspace:${agentSessionScopeKey(location)}`
          : 'global'
    return this.transact(async () => {
      this.state.preferences[key] = enabled
      await this.persist()
    })
  }

  getNotice(noticeId: string): AgentSessionBranchNotice | null {
    return this.state.notices.find((notice) => notice.noticeId === noticeId) ?? null
  }

  noticesFor(sessionId: string): AgentSessionBranchNotice[] {
    return this.state.notices.filter((notice) => notice.sourceSessionId === sessionId)
  }

  putNotice(notice: AgentSessionBranchNotice): Promise<AgentSessionBranchNotice> {
    return this.transact(async () => {
      const index = this.state.notices.findIndex((item) => item.noticeId === notice.noticeId)
      if (index === -1) {
        this.state.notices.push(notice)
      } else {
        this.state.notices[index] = notice
      }
      await this.persist()
      return notice
    })
  }

  wouldCreateCycle(sourceSessionId: string, targetSessionId: string): boolean {
    const pending = [targetSessionId]
    const visited = new Set<string>()
    while (pending.length > 0) {
      const current = pending.pop()!
      if (current === sourceSessionId) {
        return true
      }
      if (visited.has(current)) {
        continue
      }
      visited.add(current)
      for (const branch of this.state.branches) {
        if (branch.source.sessionId === current) {
          pending.push(branch.target.sessionId)
        }
      }
    }
    return false
  }

  put(record: AgentSessionBranchRecord): Promise<AgentSessionBranchRecord> {
    return this.transact(async () => {
      const index = this.state.branches.findIndex((branch) => branch.branchId === record.branchId)
      if (index === -1) {
        this.state.branches.push(record)
      } else {
        this.state.branches[index] = record
      }
      await this.persist()
      return record
    })
  }

  runExclusive<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = this.exclusive.get(key) ?? Promise.resolve()
    const next = previous.then(run, run)
    this.exclusive.set(key, next)
    void next
      .finally(() => {
        if (this.exclusive.get(key) === next) {
          this.exclusive.delete(key)
        }
      })
      .catch(() => {})
    return next
  }

  putReturn(record: AgentSessionReturnArtifact): Promise<AgentSessionReturnArtifact> {
    return this.transact(async () => {
      const index = this.state.returns.findIndex((item) => item.returnId === record.returnId)
      if (index === -1) {
        this.state.returns.push(record)
      } else {
        this.state.returns[index] = record
      }
      await this.persist()
      return record
    })
  }

  private transact<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 })
    await chmod(dirname(this.filePath), 0o700)
    const temp = durableWriteTempPath(this.filePath)
    try {
      await writeTempFileDurable(temp, JSON.stringify(this.state), 0o600)
      await renameDurable(temp, this.filePath)
    } catch (error) {
      await rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }
}
