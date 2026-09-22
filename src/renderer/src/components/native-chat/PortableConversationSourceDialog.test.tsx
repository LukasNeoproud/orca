// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor,
  PortableConversationSourceCursor,
  PortableConversationSourcePage
} from '../../../../shared/portable-conversation-source'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { readPortableConversationPage } from '@/lib/portable-conversation-source-client'
import {
  readPortableConversationTopicIndex,
  writePortableConversationTopicIndex
} from '@/lib/portable-conversation-topic-client'
import { PortableConversationSourceDialog } from './PortableConversationSourceDialog'
import { clearPortableConversationSourcePageCacheForTests } from './portable-conversation-source-page-cache'

vi.mock('@/lib/portable-conversation-source-client', () => ({
  readPortableConversationPage: vi.fn()
}))

vi.mock('@/lib/portable-conversation-topic-client', () => ({
  readPortableConversationTopicIndex: vi.fn(),
  writePortableConversationTopicIndex: vi.fn()
}))
vi.mock('@/lib/portable-conversation-branch-client', () => ({
  readPortableConversationBranches: vi.fn().mockResolvedValue({ branches: [], returns: [] })
}))

vi.mock('@/lib/portable-conversation-proposal-client', () => ({
  portableProposalClient: {
    get: vi.fn().mockResolvedValue({ proposal: null }),
    preferenceGet: vi.fn().mockResolvedValue({ preference: { enabled: false, source: 'default' } }),
    preferenceSet: vi.fn(),
    analyze: vi.fn(),
    put: vi.fn(),
    confirm: vi.fn()
  }
}))

vi.mock('./NativeChatMessageList', () => ({
  NativeChatMessageList: ({
    session,
    onBranchMessage
  }: {
    session: { messages: NativeChatMessage[]; hasMore: boolean }
    onBranchMessage?: (message: NativeChatMessage, selectedText?: string) => void
  }) => (
    <div>
      <output data-testid="message-count">{session.messages.length}</output>
      <output data-testid="has-older">{String(session.hasMore)}</output>
      {session.messages.map((message) => (
        <button
          key={message.id}
          type="button"
          onClick={() => onBranchMessage?.(message, 'chosen text')}
        >
          {message.id}
        </button>
      ))}
    </div>
  )
}))

beforeEach(() => {
  vi.mocked(readPortableConversationTopicIndex).mockResolvedValue({
    index: { sessionId: 'provider-a', revision: 0, automatic: true, chapters: [] },
    anchors: {},
    limited: false
  })
})

afterEach(() => {
  cleanup()
  clearPortableConversationSourcePageCacheForTests()
  vi.mocked(readPortableConversationPage).mockReset()
  vi.mocked(readPortableConversationTopicIndex).mockReset()
  vi.mocked(writePortableConversationTopicIndex).mockReset()
})

const source: PortableConversationSource = {
  executionHostId: 'ssh:build-host',
  workspace: { id: 'workspace-a', path: '/srv/orca', kind: 'git-worktree' },
  provider: { agent: 'codex', sessionId: 'provider-a' },
  transcriptPath: '/home/ada/.codex/sessions/provider-a.jsonl'
}

const identity = { fingerprint: 'fingerprint-a', size: 100, mtimeMs: 10 }
const firstCursor = { offset: 0, boundaryCheckpoint: null, fileFingerprint: identity.fingerprint }
const nextCursor = {
  offset: 24,
  boundaryCheckpoint: 'checkpoint-24',
  fileFingerprint: identity.fingerprint
}

function message(id: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text: `Text for ${id}` }],
    timestamp: null,
    source: 'transcript'
  }
}

function page(
  messages: NativeChatMessage[],
  cursor: PortableConversationSourceCursor = firstCursor,
  next: PortableConversationSourceCursor | null = nextCursor,
  value: PortableConversationSource = source,
  sourceIdentity = identity
): PortableConversationSourcePage {
  return {
    source: value,
    transcriptMessages: messages,
    turnEvidence: {
      completedAssistantMessageIds: messages
        .filter((entry) => entry.role === 'assistant')
        .map((entry) => entry.id),
      pendingAssistantMessageId: null
    },
    cursor,
    nextCursor: next,
    identity: sourceIdentity,
    limited: next !== null,
    warnings: []
  }
}

function renderDialog(
  initialAnchor?: PortableConversationSourceAnchor,
  value: PortableConversationSource = source,
  onSelect = vi.fn()
) {
  const result = render(
    <PortableConversationSourceDialog
      target={{ kind: 'local' }}
      source={value}
      initialAnchor={initialAnchor}
      onClose={vi.fn()}
      onSelect={onSelect}
    />
  )
  return { ...result, onSelect }
}

describe('PortableConversationSourceDialog', () => {
  it('does not select a user message or an assistant response without completion evidence', async () => {
    const incomplete = page([{ ...message('user'), role: 'user' }, message('pending')])
    incomplete.turnEvidence = {
      completedAssistantMessageIds: [],
      pendingAssistantMessageId: 'pending'
    }
    vi.mocked(readPortableConversationPage).mockResolvedValue(incomplete)
    const onSelect = vi.fn()
    renderDialog(undefined, source, onSelect)
    fireEvent.click(await screen.findByRole('button', { name: 'pending' }))
    fireEvent.click(screen.getByRole('button', { name: 'user' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reads the SSH transcript from its chronological beginning and loads next explicitly', async () => {
    vi.mocked(readPortableConversationPage)
      .mockResolvedValueOnce(page([message('m-1')]))
      .mockResolvedValueOnce(page([message('m-1'), message('m-2')], nextCursor, null))

    renderDialog()

    await waitFor(() => expect(screen.getByTestId('message-count')).toHaveTextContent('1'))
    expect(readPortableConversationPage).toHaveBeenCalledWith({ kind: 'local' }, source, undefined)
    expect(screen.getByTestId('has-older')).toHaveTextContent('false')
    fireEvent.click(screen.getByRole('button', { name: 'Load next messages' }))
    await waitFor(() => expect(screen.getByTestId('message-count')).toHaveTextContent('2'))
    expect(readPortableConversationPage).toHaveBeenLastCalledWith(
      { kind: 'local' },
      source,
      nextCursor
    )
  })

  it('starts from an exact anchor page and returns its cursor, identity, and selected passage', async () => {
    const anchor: PortableConversationSourceAnchor = {
      messageId: 'm-1',
      cursor: nextCursor,
      identity
    }
    vi.mocked(readPortableConversationPage).mockResolvedValue(
      page([message('m-1')], nextCursor, null)
    )
    const { onSelect } = renderDialog(anchor)

    await waitFor(() => expect(screen.getByRole('button', { name: 'm-1' })).toBeInTheDocument())
    expect(readPortableConversationPage).toHaveBeenCalledWith({ kind: 'local' }, source, nextCursor)
    fireEvent.click(screen.getByRole('button', { name: 'm-1' }))
    expect(onSelect).toHaveBeenCalledWith({
      source,
      anchor: { ...anchor, selectedText: 'chosen text' },
      message: message('m-1')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Show from beginning' }))
    await waitFor(() =>
      expect(readPortableConversationPage).toHaveBeenLastCalledWith(
        { kind: 'local' },
        source,
        undefined
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show selected response' }))
    await waitFor(() =>
      expect(readPortableConversationPage).toHaveBeenLastCalledWith(
        { kind: 'local' },
        source,
        nextCursor
      )
    )
  })

  it('restores a manually loaded page range for the same source before revalidating it', async () => {
    vi.mocked(readPortableConversationPage)
      .mockResolvedValueOnce(page([message('m-1')]))
      .mockResolvedValueOnce(page([message('m-2')], nextCursor, null))
      .mockResolvedValueOnce(page([message('m-1')]))
    const first = renderDialog()

    await screen.findByRole('button', { name: 'm-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Load next messages' }))
    await screen.findByRole('button', { name: 'm-2' })
    first.unmount()

    renderDialog()
    expect(screen.getByTestId('message-count')).toHaveTextContent('2')
    await waitFor(() =>
      expect(readPortableConversationPage).toHaveBeenLastCalledWith(
        { kind: 'local' },
        source,
        undefined
      )
    )
  })

  it('never renders a previous source while a new source is loading', async () => {
    const sourceB: PortableConversationSource = {
      ...source,
      provider: { agent: 'claude', sessionId: 'provider-b' },
      workspace: { ...source.workspace, id: 'workspace-b', path: '/srv/other' },
      transcriptPath: '/home/ada/.claude/provider-b.jsonl'
    }
    let resolveFirst: (value: PortableConversationSourcePage) => void = () => undefined
    vi.mocked(readPortableConversationPage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce(page([message('b-1')], firstCursor, null, sourceB))
    const view = renderDialog()

    view.rerender(
      <PortableConversationSourceDialog
        target={{ kind: 'local' }}
        source={sourceB}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    await screen.findByRole('button', { name: 'b-1' })
    resolveFirst(page([message('a-1')], firstCursor, null))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'a-1' })).toBeNull())
    expect(screen.getByRole('button', { name: 'b-1' })).toBeInTheDocument()
  })

  it('does not reuse cached anchors after the source identity changes', async () => {
    vi.mocked(readPortableConversationPage).mockResolvedValueOnce(
      page([message('old')], firstCursor, null)
    )
    const first = renderDialog()
    await screen.findByRole('button', { name: 'old' })
    first.unmount()

    const changedIdentity = { fingerprint: 'fingerprint-b', size: 200, mtimeMs: 20 }
    let resolveRead: (value: PortableConversationSourcePage) => void = () => undefined
    vi.mocked(readPortableConversationPage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve
        })
    )
    const onSelect = vi.fn()
    renderDialog(undefined, source, onSelect)
    expect(screen.getByRole('button', { name: 'old' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'old' }))
    expect(onSelect).not.toHaveBeenCalled()

    resolveRead(page([message('new')], firstCursor, null, source, changedIdentity))
    await screen.findByRole('button', { name: 'new' })
    expect(screen.queryByRole('button', { name: 'old' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'new' }))
    expect(onSelect).toHaveBeenCalledWith({
      source,
      anchor: {
        messageId: 'new',
        cursor: firstCursor,
        identity: changedIdentity,
        selectedText: 'chosen text'
      },
      message: message('new')
    })
  })

  it('navigates a durable topic item through its exact portable source anchor', async () => {
    const topicAnchor = { messageId: 'topic-message', cursor: nextCursor, identity }
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue({
      index: {
        sessionId: 'provider-a',
        revision: 2,
        automatic: true,
        chapters: [
          {
            id: 'topic',
            title: 'Remote recovery',
            titleSource: 'automatic',
            boundaryAfterManual: false,
            start: { epoch: 'epoch', itemId: 'topic-user', sequence: 4 },
            end: { epoch: 'epoch', itemId: 'topic-response', sequence: 5 }
          }
        ]
      },
      anchors: { 'topic-user': topicAnchor },
      limited: false
    })
    vi.mocked(readPortableConversationPage)
      .mockResolvedValueOnce(page([message('m-1')]))
      .mockResolvedValueOnce(page([message('topic-message')], nextCursor, null))
    renderDialog()

    await waitFor(() => expect(readPortableConversationTopicIndex).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Topics' }))
    fireEvent.click(screen.getByRole('button', { name: /Remote recovery/ }))

    await waitFor(() =>
      expect(readPortableConversationPage).toHaveBeenLastCalledWith(
        { kind: 'local' },
        source,
        nextCursor
      )
    )
  })

  it('continues a bounded host topic scan only after an explicit request', async () => {
    vi.mocked(readPortableConversationTopicIndex).mockResolvedValue({
      index: { sessionId: 'provider-a', revision: 0, automatic: true, chapters: [] },
      anchors: {},
      limited: true
    })
    vi.mocked(readPortableConversationPage).mockResolvedValue(page([]))
    renderDialog()

    await screen.findByRole('button', { name: 'Load more topics' })
    fireEvent.click(screen.getByRole('button', { name: 'Load more topics' }))
    await waitFor(() =>
      expect(readPortableConversationTopicIndex).toHaveBeenLastCalledWith(
        { kind: 'local' },
        { source, refresh: true }
      )
    )
  })

  it('surfaces the verified reader error without replacing it with local transcript data', async () => {
    vi.mocked(readPortableConversationPage).mockRejectedValue(new Error('SSH source unavailable'))

    renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('SSH source unavailable')
    expect(readPortableConversationPage).toHaveBeenCalledTimes(1)
  })
})
