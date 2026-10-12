import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { createWorkspaceFromComposerSource } from './source-workspace-create'
import type { MobileComposerCreateSelection } from './mobile-composer-source-types'
import { normalizeTaskSourceContext } from '../../../src/shared/task-source-context'
import { WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import { WORKTREE_CREATE_DEDUPE_TTL_LEGACY_HOST_MS } from './worktree-create-idempotency-policy'

type Call = { method: string; params: Record<string, unknown> }

function fakeClient(handle: (method: string, call: number) => unknown, calls: Call[]): RpcClient {
  return {
    sendRequest: async (method: string, params?: unknown) => {
      calls.push({ method, params: (params ?? {}) as Record<string, unknown> })
      const result = handle(method, calls.length)
      if (result instanceof Error) {
        return {
          id: '1',
          ok: false,
          error: { code: 'x', message: result.message },
          _meta: { runtimeId: 'r' }
        }
      }
      return { id: '1', ok: true, result, _meta: { runtimeId: 'r' } }
    }
  } as unknown as RpcClient
}

const agent = { choice: 'blank' as const }
const IDEMPOTENT_CREATE_SUPPORT = {
  dedupeTtlMs: WORKTREE_CREATE_DEDUPE_TTL_LEGACY_HOST_MS
}

const baseArgs = {
  targetRepoId: 'repo-1',
  setupDecision: 'inherit' as const,
  agent,
  workspaceName: undefined,
  note: undefined,
  worktreeCreateIdempotency: IDEMPOTENT_CREATE_SUPPORT,
  // Existing cases keep pinning the legacy create; the launch cases opt in explicitly.
  agentLaunchSupported: false
}

describe('createWorkspaceFromComposerSource', () => {
  it('creates a Jira workspace with issue and account provenance', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      (method) =>
        method === 'status.get'
          ? { capabilities: [WORKTREE_LINKED_WORK_ITEM_CONTEXT_RUNTIME_CAPABILITY] }
          : { worktree: { id: 'jira-worktree' } },
      calls
    )
    const sourceContext = normalizeTaskSourceContext({
      provider: 'jira',
      projectId: 'project-1',
      hostId: 'local',
      repoId: 'repo-1',
      providerIdentity: {
        provider: 'jira',
        siteId: 'site-1',
        siteUrl: 'https://acme.atlassian.net',
        projectKey: 'ORCA'
      }
    })!
    await createWorkspaceFromComposerSource({
      client,
      selection: {
        kind: 'work-item',
        item: {
          provider: 'jira',
          type: 'issue',
          number: 0,
          title: 'Fix setup',
          url: 'https://acme.atlassian.net/browse/ORCA-7',
          jiraIdentifier: 'ORCA-7',
          jiraSourceContext: sourceContext
        }
      },
      ...baseArgs,
      advanced: { parentWorktreeId: null }
    })
    const create = calls.find((call) => call.method === 'worktree.create')!
    expect(create.params).toMatchObject({
      repo: 'id:repo-1',
      name: 'orca-7',
      linkedWorkItem: { provider: 'jira', jiraIdentifier: 'ORCA-7' },
      linkedTaskSourceContext: sourceContext,
      noParent: true
    })
    expect(create.params.linkedWorkItem).not.toHaveProperty('jiraSourceContext')
  })

  it('rejects Jira creation when the host cannot preserve issue provenance', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ capabilities: [] }), calls)
    const result = await createWorkspaceFromComposerSource({
      client,
      selection: {
        kind: 'work-item',
        item: {
          provider: 'jira',
          type: 'issue',
          number: 0,
          title: 'Fix setup',
          url: 'https://acme.atlassian.net/browse/ORCA-7',
          jiraIdentifier: 'ORCA-7'
        }
      },
      ...baseArgs
    })
    expect(result).toEqual({ error: 'Update Orca on the host to link Jira issues to worktrees.' })
    expect(calls.map((call) => call.method)).toEqual(['status.get'])
  })

  it('applies advanced choices to linked work items while preserving source links', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-advanced' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'github',
        type: 'issue',
        number: 12,
        title: 'Bug',
        url: 'u',
        repoId: 'repo-1'
      },
      baseBranch: 'main'
    }
    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      advanced: {
        displayLabel: 'Fix checkout',
        baseRef: 'origin/stable',
        sparseCheckout: { directories: ['src'], presetId: 'preset-1' },
        parentWorktreeId: 'parent-1'
      }
    })
    expect(calls[0]!.params).toMatchObject({
      linkedIssue: 12,
      displayName: 'Fix checkout',
      displayNameKind: 'user',
      baseBranch: 'origin/stable',
      sparseCheckout: { directories: ['src'], presetId: 'preset-1' },
      parentWorkspace: 'worktree:parent-1',
      parentWorkspaceOrigin: 'manual'
    })
  })

  it('applies a custom base ref to a new branch without changing its branch name', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-new' } }), calls)
    await createWorkspaceFromComposerSource({
      client,
      selection: { kind: 'new-branch', branchName: 'feature/login' },
      ...baseArgs,
      advanced: { baseRef: 'origin/develop', parentWorktreeId: null }
    })
    expect(calls[0]!.params).toMatchObject({
      name: 'feature/login',
      branchNameOverride: 'feature/login',
      baseBranch: 'origin/develop',
      noParent: true
    })
  })

  it('creates a GitHub issue workspace linking the issue to its own repo', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-1' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'github',
        type: 'issue',
        number: 7,
        title: 'Bug',
        url: 'u',
        repoId: 'repo-9'
      }
    }
    // The composer supplies the title-derived name as workspaceName; with none,
    // buildTaskWorkspaceCreateParams falls back to the "<type>-<number>" slug.
    const result = await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(result).toMatchObject({ worktreeId: 'wt-1', name: 'issue-7' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.method).toBe('worktree.create')
    expect(calls[0]!.params).toMatchObject({
      repo: 'id:repo-9',
      linkedIssue: 7,
      displayName: 'Bug'
    })
  })

  it('passes composer-resolved PR base fields straight through (no re-resolve)', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-2' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'github',
        type: 'pr',
        number: 3,
        title: 'Feat',
        url: 'u',
        repoId: 'repo-1'
      },
      baseBranch: 'main',
      compareBaseRef: 'origin/main',
      pushTarget: { remoteName: 'origin', branchName: 'feat-3' },
      branchNameOverride: 'feat-3'
    }
    await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(calls.map((c) => c.method)).toEqual(['worktree.create'])
    expect(calls[0]!.params).toMatchObject({
      linkedPR: 3,
      baseBranch: 'main',
      compareBaseRef: 'origin/main',
      branchNameOverride: 'feat-3',
      pushTarget: { remoteName: 'origin', branchName: 'feat-3' }
    })
  })

  it('resolves a PR base as a fallback when the selection carries none', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      (method) =>
        method === 'worktree.resolvePrBase'
          ? { baseBranch: 'develop' }
          : { worktree: { id: 'wt-3' } },
      calls
    )
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: { provider: 'github', type: 'pr', number: 4, title: 'X', url: 'u', repoId: 'repo-1' }
    }
    await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(calls.map((c) => c.method)).toEqual(['worktree.resolvePrBase', 'worktree.create'])
    expect(calls[1]!.params).toMatchObject({ baseBranch: 'develop', linkedPR: 4 })
  })

  it('creates a Linear workspace with workspace + org routing', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-4' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'linear',
        type: 'issue',
        number: 0,
        title: 'Ship it',
        url: 'https://linear.app/acme/issue/ENG-9',
        linearIdentifier: 'ENG-9',
        linearWorkspaceId: 'ws-1',
        linearOrganizationUrlKey: 'acme'
      }
    }
    await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(calls[0]!.params).toMatchObject({
      repo: 'id:repo-1',
      linkedLinearIssue: 'ENG-9',
      linkedLinearIssueWorkspaceId: 'ws-1',
      linkedLinearIssueOrganizationUrlKey: 'acme'
    })
  })

  it('reuses an existing branch with a single attempt (no suffix retry)', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => new Error('Branch "feature" already exists.'), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'branch',
      baseBranch: 'feature',
      refName: 'feature',
      localBranchName: 'feature',
      reuse: true,
      branchNameOverride: 'feature'
    }
    const result = await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect('error' in result).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toMatchObject({
      baseBranch: 'feature',
      branchNameOverride: 'feature'
    })
  })

  it('creates a brand-new branch by name, keeping a slashy name as the branch', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-nb' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'new-branch',
      branchName: 'feature/login'
    }
    const result = await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(result).toMatchObject({ worktreeId: 'wt-nb', name: 'feature/login' })
    expect(calls[0]!.params).toMatchObject({
      repo: 'id:repo-1',
      name: 'feature/login',
      branchNameOverride: 'feature/login'
    })
  })

  it('does not pin an automatically managed branch selection without a custom label', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-auto-branch' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'branch',
      baseBranch: 'main',
      refName: 'main',
      localBranchName: 'topic',
      reuse: false,
      branchNameOverride: 'topic'
    }
    await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(calls[0]!.params).not.toHaveProperty('displayName')
    expect(calls[0]!.params).not.toHaveProperty('displayNameKind')
  })

  it('does not pin an auto-derived branch label even when the draft is populated', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-auto-branch-draft' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'new-branch',
      branchName: 'topic'
    }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      workspaceName: 'topic',
      nameIsAutoManaged: true
    })

    expect(calls[0]!.params).not.toHaveProperty('displayName')
    expect(calls[0]!.params).not.toHaveProperty('displayNameKind')
  })

  it('pins a custom label for a new branch selection', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-labeled-branch' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'new-branch',
      branchName: 'feature/login'
    }
    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      workspaceName: '  Login work  '
    })
    expect(calls[0]!.params).toMatchObject({
      displayName: 'Login work',
      displayNameKind: 'user'
    })
  })

  it('pins displayName when the name is user-edited (not auto-managed)', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-dn' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'github',
        type: 'issue',
        number: 7,
        title: 'Bug',
        url: 'u',
        repoId: 'repo-1'
      }
    }
    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      workspaceName: 'my-name',
      nameIsAutoManaged: false
    })
    expect(calls[0]!.params).toMatchObject({
      name: 'my-name',
      displayName: 'my-name',
      displayNameKind: 'user',
      linkedIssue: 7
    })
  })

  it('creates a new branch off a ref, bumping the branch on collision', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      (_m, n) => (n === 1 ? new Error('already exists locally') : { worktree: { id: 'wt-5' } }),
      calls
    )
    const selection: MobileComposerCreateSelection = {
      kind: 'branch',
      baseBranch: 'main',
      refName: 'main',
      localBranchName: 'topic',
      reuse: false,
      branchNameOverride: 'topic'
    }
    const result = await createWorkspaceFromComposerSource({ client, selection, ...baseArgs })
    expect(result).toMatchObject({ worktreeId: 'wt-5', name: 'topic-2' })
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params).toMatchObject({
      baseBranch: 'main',
      branchNameOverride: 'topic-2',
      name: 'topic-2'
    })
  })

  it('sends startupAgent (not a pre-built command) for a non-blank agent', async () => {
    // Why: regression — a bare startupCommand skipped the host's default
    // `--dangerously-skip-permissions`; the host must resolve the launch args.
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-agent' } }), calls)
    const selection: MobileComposerCreateSelection = { kind: 'new-branch', branchName: 'topic' }
    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'claude' }
    })
    expect(calls[0]!.params).toMatchObject({
      startupAgent: 'claude',
      createdWithAgent: 'claude'
    })
    expect('startupCommand' in calls[0]!.params).toBe(false)
  })
  it('routes a branch selection with an agent through agent.launch', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      () => ({ worktreeId: 'wt-branch-launch', outcome: { kind: 'structured' } }),
      calls
    )
    const selection: MobileComposerCreateSelection = {
      kind: 'branch',
      baseBranch: 'main',
      refName: 'main',
      localBranchName: 'topic',
      reuse: false,
      branchNameOverride: 'topic'
    }

    const result = await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'claude' },
      agentLaunchSupported: { replay: false }
    })

    expect(result).toEqual({ worktreeId: 'wt-branch-launch', name: 'topic' })
    expect(calls[0]!.method).toBe('agent.launch')
    expect(calls[0]?.params).toMatchObject({
      agent: 'claude',
      target: { create: { baseBranch: 'main', name: 'topic' } }
    })
    expect(calls[0]?.params).not.toHaveProperty(['target', 'create', 'startupAgent'])
  })

  it('routes a reused branch through agent.launch without spending the retry budget', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => new Error('Branch "topic" already exists locally.'), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'branch',
      baseBranch: 'main',
      refName: 'origin/topic',
      localBranchName: 'topic',
      reuse: true
    }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'codex' },
      agentLaunchSupported: { replay: false }
    })

    expect(calls.map((call) => call.method)).toEqual(['agent.launch'])
  })

  it('routes a new-branch selection with an agent through agent.launch', async () => {
    const calls: Call[] = []
    const client = fakeClient(
      () => ({ worktreeId: 'wt-new-branch-launch', outcome: { kind: 'terminal', handle: 't' } }),
      calls
    )
    const selection: MobileComposerCreateSelection = { kind: 'new-branch', branchName: 'topic' }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'claude' },
      agentLaunchSupported: { replay: false }
    })

    expect(calls[0]!.method).toBe('agent.launch')
    expect(calls[0]?.params).toMatchObject({
      target: { create: { name: 'topic', branchNameOverride: 'topic' } }
    })
    expect(calls[0]?.params).not.toHaveProperty(['target', 'create', 'startupAgent'])
  })

  it('keeps a work-item create on worktree.create so its unsent draft survives', async () => {
    // Scope boundary: an agent-carrying work-item create pre-fills the issue/PR URL as an unsent
    // `startupDraft`. A structured session has nowhere to hold one, so routing it would submit the
    // URL as the first turn. Stay on the terminal until drafts land.
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-draft' } }), calls)
    const selection: MobileComposerCreateSelection = {
      kind: 'work-item',
      item: {
        provider: 'github',
        type: 'issue',
        number: 7,
        title: 'Bug',
        url: 'https://github.test/acme/app/issues/7',
        repoId: 'repo-9'
      }
    }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'claude' },
      agentLaunchSupported: { replay: false }
    })

    expect(calls.map((call) => call.method)).toEqual(['worktree.create'])
    // The host picks the agent for a work item (desktop parity) and drafts the URL into it, so the
    // payload carries `createdWithAgent` + `startupDraft` rather than a `startupAgent`.
    expect(calls[0]!.params).toMatchObject({
      createdWithAgent: 'claude',
      startupDraft: 'https://github.test/acme/app/issues/7'
    })
  })

  it('keeps the agent-first create for a branch selection on an old host', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-old-host' } }), calls)
    const selection: MobileComposerCreateSelection = { kind: 'new-branch', branchName: 'topic' }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agent: { choice: 'claude' },
      agentLaunchSupported: false
    })

    expect(calls[0]!.method).toBe('worktree.create')
    expect(calls[0]!.params).toMatchObject({ startupAgent: 'claude', createdWithAgent: 'claude' })
  })

  it('never launches for a blank choice on a capable host', async () => {
    const calls: Call[] = []
    const client = fakeClient(() => ({ worktree: { id: 'wt-blank-choice' } }), calls)
    const selection: MobileComposerCreateSelection = { kind: 'new-branch', branchName: 'topic' }

    await createWorkspaceFromComposerSource({
      client,
      selection,
      ...baseArgs,
      agentLaunchSupported: { replay: false }
    })

    expect(calls[0]!.method).toBe('worktree.create')
    expect('startupAgent' in calls[0]!.params).toBe(false)
  })
})
