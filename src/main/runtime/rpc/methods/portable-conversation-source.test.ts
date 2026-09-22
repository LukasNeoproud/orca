import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
const mock = vi.hoisted(() => ({
  readSession: vi.fn(),
  readPage: vi.fn(),
  readContext: vi.fn(),
  showWorkspace: vi.fn()
}))
vi.mock('../../../conversation-branch/portable-conversation-source-runtime-reader', () => ({
  createRuntimeSshPortableConversationSourceReader: () => ({
    readSession: mock.readSession,
    readPage: mock.readPage,
    readContext: mock.readContext
  })
}))
import { PORTABLE_CONVERSATION_SOURCE_METHODS } from './portable-conversation-source'

const source = {
  executionHostId: 'ssh:host',
  workspace: { id: 'folder:one', path: '/srv/project', kind: 'folder' },
  provider: { agent: 'claude', sessionId: 'session' },
  transcriptPath: '/home/user/.claude/session.jsonl'
}
const cursor = { offset: 0, fileFingerprint: 'identity', boundaryCheckpoint: null }
const anchor = {
  messageId: 'message',
  cursor,
  identity: { fingerprint: 'identity', size: 200, mtimeMs: 10 }
}
const runtime = {
  getRuntimeId: () => 'owning-runtime',
  showManagedTerminalWorkspace: mock.showWorkspace,
  listRepos: () => []
} as unknown as OrcaRuntimeService
const dispatch = (method: string, params: unknown) =>
  new RpcDispatcher({ runtime, methods: PORTABLE_CONVERSATION_SOURCE_METHODS }).dispatch({
    id: 'request',
    authToken: '',
    method,
    params
  })

describe('portable SSH source RPC authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.showWorkspace.mockResolvedValue({
      id: 'folder:one',
      path: '/srv/project',
      hostId: 'ssh:host',
      repoId: ''
    })
    mock.readPage.mockResolvedValue({ transcriptMessages: [] })
    mock.readContext.mockResolvedValue({ contextMarkdown: 'exact source' })
  })
  it('passes the canonical workspace and explicit SSH host to the owning reader', async () => {
    expect(
      await dispatch('portableConversation.sourcePage', {
        source,
        cursor: { ...cursor, pendingAssistantMessageId: 'forged-in-cursor' },
        pendingAssistantMessageId: 'forged-at-top-level'
      })
    ).toMatchObject({ ok: true, _meta: { runtimeId: 'owning-runtime' } })
    expect(mock.readPage).toHaveBeenCalledExactlyOnceWith({ source, cursor })
  })
  it('resolves resume metadata only through the canonical source reader', async () => {
    mock.readSession.mockResolvedValue({ sessionId: 'session', executionHostId: 'ssh:host' })
    expect(await dispatch('portableConversation.sourceSession', { source })).toMatchObject({
      ok: true
    })
    expect(mock.readSession).toHaveBeenCalledExactlyOnceWith(source)
    mock.readSession.mockClear()
    expect(
      await dispatch('portableConversation.sourceSession', {
        source: { ...source, workspace: { ...source.workspace, path: '/wrong' } }
      })
    ).toMatchObject({ ok: false })
    expect(mock.readSession).not.toHaveBeenCalled()
  })
  it('refuses a forged or stale workspace path before reading a transcript', async () => {
    expect(
      await dispatch('portableConversation.sourcePage', {
        source: { ...source, workspace: { ...source.workspace, path: '/other/project' } }
      })
    ).toMatchObject({ ok: false })
    expect(mock.readPage).not.toHaveBeenCalled()
  })
  it('refuses a same-named host from the wrong controlling runtime namespace', async () => {
    mock.showWorkspace.mockResolvedValue({
      id: 'folder:one',
      path: '/srv/project',
      hostId: 'ssh:different',
      repoId: ''
    })
    expect(
      await dispatch('portableConversation.sourceContext', { source, anchor, mode: 'history' })
    ).toMatchObject({ ok: false })
    expect(mock.readContext).not.toHaveBeenCalled()
  })
  it('requires the observed source identity and forwards it unchanged for preparation', async () => {
    const { identity: _identity, ...unverified } = anchor
    expect(
      await dispatch('portableConversation.sourceContext', {
        source,
        anchor: unverified,
        mode: 'targeted'
      })
    ).toMatchObject({ ok: false })
    expect(mock.readContext).not.toHaveBeenCalled()
    expect(
      await dispatch('portableConversation.sourceContext', { source, anchor, mode: 'targeted' })
    ).toMatchObject({ ok: true })
    expect(mock.readContext).toHaveBeenCalledExactlyOnceWith({ source, anchor, mode: 'targeted' })
  })
  it('does not accept a local execution target on the SSH-specific surface', async () => {
    expect(
      await dispatch('portableConversation.sourcePage', {
        source: { ...source, executionHostId: 'local' }
      })
    ).toMatchObject({ ok: false })
    expect(mock.readPage).not.toHaveBeenCalled()
    expect(mock.showWorkspace).not.toHaveBeenCalled()
  })
})
