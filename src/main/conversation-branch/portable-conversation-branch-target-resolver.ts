import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type {
  PortableConversationBranchRecord,
  PortableConversationTerminalReceipt
} from '../../shared/portable-conversation-branch'
import { portableConversationTerminalSessionId } from '../../shared/portable-conversation-branch'
import type {
  PortableConversationSource,
  PortableConversationSourcePage
} from '../../shared/portable-conversation-source'
import type { AgentSessionBranchStore } from '../runtime/agent-session-branch-store'
import type { PortableConversationWorkspace } from '../runtime/portable-conversation-workspace'
import { completePortableConversationBranchStart } from './portable-conversation-branch-delivery'
import { isPortableConversationBranchRecord } from './portable-conversation-branch-service'

const MAX_RELEVANT_BRANCHES = 8

export type PortableConversationBranchTargetResolverDependencies = {
  store: AgentSessionBranchStore
  listSessions: (source: PortableConversationSource) => Promise<readonly AiVaultSession[]>
  readPage: (params: {
    source: PortableConversationSource
  }) => Promise<PortableConversationSourcePage>
  resolveWorkspace: (
    workspaceId: string,
    executionHostId: string
  ) => Promise<PortableConversationWorkspace>
}

export async function resolvePortableConversationBranchTarget(
  dependencies: PortableConversationBranchTargetResolverDependencies,
  branchId: string,
  expectedSource?: PortableConversationSource
): Promise<PortableConversationBranchRecord> {
  const branch = requirePortableBranch(dependencies.store, branchId)
  const workspace = await canonicalTargetWorkspace(dependencies, branch)
  const existingSource = branch.target.terminal.existingSource
  if (existingSource) {
    const source = canonicalExistingSource(branch, workspace, existingSource, expectedSource)
    const candidate = uniqueCandidate(
      await verifiedSessionList(dependencies, source),
      branch,
      workspace,
      source.provider.sessionId
    )
    if (candidate.filePath !== source.transcriptPath) {
      throw unverifiable()
    }
    await verifiedRead(dependencies, source)
    return branch
  }
  const launch = branch.target.terminal.launch
  const receipt = launch?.receipt
  const providerSession = receipt?.providerSession
  if (!launch || !receipt || !providerSession) {
    throw unverifiable()
  }
  assertExpectedSourceOwner(branch, workspace, expectedSource)
  const probe = portableSource(
    branch,
    workspace,
    providerSession.id,
    unresolvedPath(receipt, expectedSource)
  )
  const candidate = uniqueCandidate(
    await verifiedSessionList(dependencies, probe),
    branch,
    workspace,
    providerSession.id
  )
  if (expectedSource && candidate.filePath !== expectedSource.transcriptPath) {
    throw unverifiable()
  }
  const source = portableSource(branch, workspace, providerSession.id, candidate.filePath)
  await verifiedRead(dependencies, source)
  return completePortableConversationBranchStart(dependencies.store, {
    branchId: branch.branchId,
    attemptId: launch.attemptId,
    outcome: {
      kind: 'launched',
      receipt: enrichedReceipt(receipt, branch, candidate)
    }
  })
}

export async function resolvePortableConversationFamilyTargets(
  dependencies: PortableConversationBranchTargetResolverDependencies,
  source: PortableConversationSource
): Promise<void> {
  const relevant = dependencies.store
    .allBranches()
    .filter(isPortableConversationBranchRecord)
    .filter((branch) => needsSourceResolution(branch, source))
  if (relevant.length > MAX_RELEVANT_BRANCHES) {
    throw new Error('portable_conversation_branch_resolution_limit')
  }
  for (const branch of relevant) {
    await resolvePortableConversationBranchTarget(dependencies, branch.branchId, source)
  }
}

function needsSourceResolution(
  branch: PortableConversationBranchRecord,
  source: PortableConversationSource
): boolean {
  const workspace = branch.target.terminal.workspace
  const receipt = branch.target.terminal.launch?.receipt
  const provider = receipt?.providerSession
  return (
    !branch.target.terminal.existingSource &&
    !!provider &&
    portableConversationTerminalSessionId({
      executionHostId: workspace.executionHostId,
      agent: branch.target.agent,
      providerSession: provider,
      ...(receipt?.history ? { history: receipt.history } : {})
    }) === null &&
    provider.id === source.provider.sessionId &&
    branch.target.agent === source.provider.agent &&
    workspace.executionHostId === source.executionHostId &&
    workspace.workspaceId === source.workspace.id
  )
}

async function canonicalTargetWorkspace(
  dependencies: PortableConversationBranchTargetResolverDependencies,
  branch: PortableConversationBranchRecord
): Promise<PortableConversationWorkspace> {
  const saved = branch.target.terminal.workspace
  let workspace: PortableConversationWorkspace
  try {
    workspace = await dependencies.resolveWorkspace(saved.workspaceId, saved.executionHostId)
  } catch {
    throw unverifiable()
  }
  if (
    workspace.workspaceId !== saved.workspaceId ||
    workspace.executionHostId !== saved.executionHostId ||
    workspace.path !== saved.path ||
    workspace.kind !== saved.kind ||
    workspace.projectId !== saved.projectId
  ) {
    throw unverifiable()
  }
  return workspace
}

async function verifiedSessionList(
  dependencies: PortableConversationBranchTargetResolverDependencies,
  source: PortableConversationSource
): Promise<readonly AiVaultSession[]> {
  try {
    return await dependencies.listSessions(source)
  } catch {
    throw unverifiable()
  }
}

async function verifiedRead(
  dependencies: PortableConversationBranchTargetResolverDependencies,
  source: PortableConversationSource
): Promise<void> {
  try {
    await dependencies.readPage({ source })
  } catch {
    throw unverifiable()
  }
}

function canonicalExistingSource(
  branch: PortableConversationBranchRecord,
  workspace: PortableConversationWorkspace,
  existing: PortableConversationSource,
  expected?: PortableConversationSource
): PortableConversationSource {
  assertExpectedSourceOwner(branch, workspace, expected)
  if (
    existing.executionHostId !== workspace.executionHostId ||
    existing.workspace.id !== workspace.workspaceId ||
    existing.workspace.path !== workspace.path ||
    existing.workspace.kind !== workspace.kind ||
    existing.provider.agent !== branch.target.agent ||
    (expected &&
      (existing.provider.sessionId !== expected.provider.sessionId ||
        existing.transcriptPath !== expected.transcriptPath))
  ) {
    throw unverifiable()
  }
  return existing
}

function assertExpectedSourceOwner(
  branch: PortableConversationBranchRecord,
  workspace: PortableConversationWorkspace,
  source?: PortableConversationSource
): void {
  if (
    source &&
    (source.executionHostId !== workspace.executionHostId ||
      source.workspace.id !== workspace.workspaceId ||
      source.workspace.path !== workspace.path ||
      source.workspace.kind !== workspace.kind ||
      source.provider.agent !== branch.target.agent)
  ) {
    throw unverifiable()
  }
}

function uniqueCandidate(
  sessions: readonly AiVaultSession[],
  branch: PortableConversationBranchRecord,
  workspace: PortableConversationWorkspace,
  providerId: string
): AiVaultSession {
  const candidates: AiVaultSession[] = []
  for (const session of sessions) {
    if (
      session.executionHostId === workspace.executionHostId &&
      session.agent === branch.target.agent &&
      session.sessionId === providerId &&
      session.subagent === null &&
      !!session.cwd &&
      isPathInsideOrEqual(workspace.path, session.cwd)
    ) {
      candidates.push(session)
      if (candidates.length > 1) {
        break
      }
    }
  }
  if (candidates.length !== 1) {
    throw unverifiable()
  }
  return candidates[0]!
}

function portableSource(
  branch: PortableConversationBranchRecord,
  workspace: PortableConversationWorkspace,
  providerId: string,
  transcriptPath: string
): PortableConversationSource {
  return {
    executionHostId: workspace.executionHostId,
    workspace: { id: workspace.workspaceId, path: workspace.path, kind: workspace.kind },
    provider: { agent: branch.target.agent, sessionId: providerId },
    transcriptPath
  }
}

function unresolvedPath(
  receipt: PortableConversationTerminalReceipt,
  expected?: PortableConversationSource
): string {
  return (
    receipt.history?.filePath ??
    receipt.providerSession?.transcriptPath ??
    expected?.transcriptPath ??
    '__unresolved__'
  )
}

function enrichedReceipt(
  receipt: PortableConversationTerminalReceipt,
  branch: PortableConversationBranchRecord,
  candidate: AiVaultSession
): PortableConversationTerminalReceipt {
  const provider = receipt.providerSession!
  return {
    ...receipt,
    launchAgent: receipt.launchAgent ?? branch.target.agent,
    providerSession: { ...provider, transcriptPath: candidate.filePath },
    history: {
      filePath: candidate.filePath,
      ...(candidate.codexHome ? { codexHome: candidate.codexHome } : {}),
      ...(candidate.cwd ? { cwd: candidate.cwd } : {})
    }
  }
}

function requirePortableBranch(
  store: AgentSessionBranchStore,
  branchId: string
): PortableConversationBranchRecord {
  const branch = store.get(branchId)
  if (!branch || !isPortableConversationBranchRecord(branch)) {
    throw new Error('portable_conversation_branch_missing')
  }
  return branch
}

function unverifiable(): Error {
  return new Error('portable_conversation_branch_target_unverifiable')
}
