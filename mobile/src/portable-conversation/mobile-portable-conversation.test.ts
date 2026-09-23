import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { PortableConversationSourcePage } from '../../../src/shared/portable-conversation-source'
import type { Worktree } from '../worktree/workspace-list-types'
import {
  appendMobilePortableSourcePage,
  EMPTY_MOBILE_PORTABLE_SOURCE_STATE,
  mobilePortableSourceKey,
  mobilePortableSourceAnchor,
  resolveMobilePortableConversationRoute
} from './mobile-portable-conversation'

function session(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: 'history-1',
    executionHostId: 'ssh:alpha',
    agent: 'codex',
    sessionId: 'provider-1',
    title: 'Session',
    cwd: '/repo/nested',
    branch: null,
    model: null,
    filePath: '/home/.codex/session.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: 'now',
    messageCount: 1,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    ...overrides
  } as AiVaultSession
}

function worktree(id: string, path: string, hostId = 'ssh:alpha'): Worktree {
  return {
    worktreeId: id,
    repoId: 'project-1',
    hostId: hostId as Worktree['hostId'],
    repo: 'repo',
    branch: 'main',
    displayName: id,
    path,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null
  }
}

describe('resolveMobilePortableConversationRoute', () => {
  it('uses the unique deepest workspace on the exact SSH execution host', () => {
    const route = resolveMobilePortableConversationRoute(session(), [
      worktree('root', '/repo'),
      worktree('nested', '/repo/nested'),
      worktree('same-name-other-host', '/repo/nested', 'ssh:beta')
    ])

    expect(route?.source).toMatchObject({
      executionHostId: 'ssh:alpha',
      workspace: { id: 'nested', path: '/repo/nested', kind: 'git-worktree' },
      provider: { agent: 'codex', sessionId: 'provider-1' }
    })
    expect(route?.targetWorktrees.map((item) => item.worktreeId)).toEqual(['root', 'nested'])
  })

  it('preserves folder identity and rejects ambiguous or non-SSH ownership', () => {
    const folder = {
      ...worktree('folder', '/repo/nested'),
      workspaceKind: 'folder-workspace' as const
    }
    expect(resolveMobilePortableConversationRoute(session(), [folder])?.source.workspace.kind).toBe(
      'folder'
    )
    expect(
      resolveMobilePortableConversationRoute(session(), [
        folder,
        { ...worktree('other-folder', '/other'), workspaceKind: 'folder-workspace' }
      ])?.targetWorktrees.map((item) => item.worktreeId)
    ).toEqual(['folder'])
    expect(resolveMobilePortableConversationRoute(session(), [folder, { ...folder }])).toBeNull()
    expect(
      resolveMobilePortableConversationRoute(session({ executionHostId: 'local' }), [folder])
    ).toBeNull()
  })

  it('scopes a visible source to the full host and workspace identity', () => {
    const first = resolveMobilePortableConversationRoute(session(), [
      worktree('a', '/repo/nested')
    ])!
    const second = resolveMobilePortableConversationRoute(
      session({ executionHostId: 'ssh:beta' }),
      [worktree('a', '/repo/nested', 'ssh:beta')]
    )!
    expect(mobilePortableSourceKey(first.source)).not.toBe(mobilePortableSourceKey(second.source))
  })
})

describe('portable source evidence', () => {
  const message = (id: string): NativeChatMessage => ({
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: id }],
    timestamp: null,
    source: 'transcript'
  })
  const page = (fingerprint: string, id: string): PortableConversationSourcePage => ({
    source: resolveMobilePortableConversationRoute(session(), [worktree('root', '/repo')])!.source,
    transcriptMessages: [message(id)],
    cursor: { offset: 0, boundaryCheckpoint: null, fileFingerprint: fingerprint },
    nextCursor: null,
    identity: { fingerprint, size: 10, mtimeMs: 1 },
    limited: false,
    warnings: [],
    turnEvidence: { completedAssistantMessageIds: [id], pendingAssistantMessageId: null }
  })

  it('anchors only provider-completed responses to their exact page evidence', () => {
    const state = appendMobilePortableSourcePage(
      EMPTY_MOBILE_PORTABLE_SOURCE_STATE,
      page('a', 'm1')
    )
    expect(mobilePortableSourceAnchor(state, 'm1')).toEqual({
      messageId: 'm1',
      cursor: page('a', 'm1').cursor,
      identity: page('a', 'm1').identity
    })
  })

  it('drops old rows and origins after a transcript identity rewrite', () => {
    const first = appendMobilePortableSourcePage(
      EMPTY_MOBILE_PORTABLE_SOURCE_STATE,
      page('a', 'm1')
    )
    const rewritten = appendMobilePortableSourcePage(first, page('b', 'm2'))
    expect(rewritten.messages.map((item) => item.id)).toEqual(['m2'])
    expect(mobilePortableSourceAnchor(rewritten, 'm1')).toBeNull()
  })
})
