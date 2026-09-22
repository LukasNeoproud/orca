// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import type { PortableConversationBranchRecord } from '../../../../shared/portable-conversation-branch'
import type { PortableConversationRequest } from '@/lib/portable-conversation-request'
const mocks = vi.hoisted(() => ({
  family: vi.fn(),
  launch: vi.fn(),
  open: vi.fn(),
  source: vi.fn(),
  resolve: vi.fn(),
  targetSource: vi.fn()
}))
vi.mock('@/lib/portable-conversation-branch-client', () => ({
  readPortableConversationBranches: mocks.family,
  resolvePortableConversationBranchTarget: mocks.resolve
}))
vi.mock('@/lib/portable-conversation-branch-launch', () => ({
  launchPortableConversationBranch: mocks.launch
}))
vi.mock('@/lib/portable-conversation-navigation', () => ({
  openPortableConversationBranch: mocks.open,
  portableConversationBranchTargetSource: mocks.targetSource
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>
}))
vi.mock('./PortableConversationSourceDialog', () => ({
  PortableConversationSourceDialog: (props: {
    open: boolean
    source: unknown
    initialAnchor?: unknown
    onSelect: (selection: unknown) => void
    children: React.ReactNode
  }) => {
    mocks.source(props)
    return props.open ? (
      <div>
        <button onClick={() => props.onSelect({ source: props.source })}>Select response</button>
        {props.children}
      </div>
    ) : null
  }
}))
vi.mock('./PortableConversationBranchDialog', () => ({
  PortableConversationBranchDialog: ({ onPrepared }: { onPrepared: (branch: unknown) => void }) => (
    <button onClick={() => onPrepared(branch)}>Prepare branch</button>
  )
}))
vi.mock('./PortableConversationResultDialog', () => ({
  PortableConversationResultDialog: ({
    existingArtifact
  }: {
    existingArtifact?: { content: string }
  }) => <div>Result: {existingArtifact?.content}</div>
}))
import { PortableConversationFlow } from './PortableConversationFlow'
const request: PortableConversationRequest = {
  target: { kind: 'local' },
  source: {
    executionHostId: 'ssh:host',
    workspace: { id: 'folder:parent', path: '/work', kind: 'folder' },
    provider: { agent: 'claude', sessionId: 'provider' },
    transcriptPath: '/history.jsonl'
  }
}
const branch = {
  branchId: 'branch',
  title: 'Saved discussion',
  state: 'prepared',
  source: {
    sessionId: 'parent',
    excerpt: 'Origin response',
    anchor: { epoch: 'epoch', itemId: 'answer' },
    portable: {
      source: request.source,
      anchor: {
        messageId: 'answer',
        cursor: { offset: 0, fileFingerprint: 'id', boundaryCheckpoint: null },
        identity: { fingerprint: 'id', size: 12, mtimeMs: 1 }
      }
    }
  },
  target: {
    sessionId: 'child',
    agent: 'claude',
    terminal: {
      workspace: {
        workspaceId: 'folder:parent',
        path: '/work',
        kind: 'folder',
        executionHostId: 'ssh:host'
      },
      launch: null
    }
  },
  handoff: { mode: 'targeted', content: 'Exact reviewed text' },
  relationKind: 'discussion',
  delivery: null
} as unknown as PortableConversationBranchRecord

describe('portable conversation flow', () => {
  beforeEach(() => {
    cleanup()
    request.source.provider.sessionId = crypto.randomUUID()
    vi.clearAllMocks()
    mocks.targetSource.mockReturnValue(null)
    mocks.family.mockResolvedValue({ branches: [], returns: [] })
    mocks.launch.mockResolvedValue({
      ...branch,
      state: 'delivery-unverified',
      delivery: { clientMessageId: 'attempt', status: 'unknown' }
    })
  })
  it('prepares without launching and starts only after a separate explicit action', async () => {
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Select response'))
    fireEvent.click(screen.getByText('Prepare branch'))
    expect(screen.getByText('Exact reviewed text')).toBeTruthy()
    expect(mocks.launch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Start work'))
    await waitFor(() =>
      expect(
        screen.getByText('Delivery is unverified. Starting again will not resend the handoff.')
      ).toBeTruthy()
    )
    expect(mocks.launch).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Start work')).toBeNull()
    expect(mocks.source.mock.calls.some(([props]) => props.open === false)).toBe(true)
  })
  it('reloads prepared branches from persistence and returns to their exact source anchor', async () => {
    mocks.family.mockResolvedValue({ branches: [branch], returns: [] })
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    const related = await screen.findByText('Related conversations', { exact: false })
    if (related.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(related)
    }
    fireEvent.click(screen.getByText('Saved discussion'))
    expect(screen.getByText('Exact reviewed text')).toBeTruthy()
    fireEvent.click(screen.getByText('Source response'))
    await waitFor(() =>
      expect(mocks.source).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: branch.source.portable.source,
          initialAnchor: branch.source.portable.anchor,
          open: true
        })
      )
    )
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('resolves missing child history for reading without launching another agent', async () => {
    const started = { ...branch, state: 'delivery-unverified' }
    const childSource = { ...request.source, transcriptPath: '/child.jsonl' }
    const resolved = { ...started, title: 'Resolved child' }
    mocks.resolve.mockResolvedValue({ branch: resolved })
    mocks.targetSource.mockImplementation((value) => (value === resolved ? childSource : null))
    mocks.family.mockResolvedValue({ branches: [started], returns: [] })
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    const related = await screen.findByText('Related conversations', { exact: false })
    if (related.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(related)
    }
    fireEvent.click(screen.getByText('Saved discussion'))
    fireEvent.click(screen.getByText('Read conversation'))
    await waitFor(() =>
      expect(mocks.source).toHaveBeenLastCalledWith(
        expect.objectContaining({ source: childSource, open: true })
      )
    )
    expect(mocks.resolve).toHaveBeenCalledWith(request.target, 'branch')
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('keeps an unavailable child visible with an error and no replacement agent', async () => {
    mocks.resolve.mockRejectedValue(new Error('Host disconnected'))
    mocks.family.mockResolvedValue({
      branches: [{ ...branch, state: 'delivery-unverified' }],
      returns: []
    })
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    const related = await screen.findByText('Related conversations', { exact: false })
    if (related.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(related)
    }
    fireEvent.click(screen.getByText('Saved discussion'))
    fireEvent.click(screen.getByText('Read conversation'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Exact reviewed text')).toBeTruthy()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('restores the selected saved handoff after remounting the same source', async () => {
    mocks.family.mockResolvedValue({ branches: [branch], returns: [] })
    const view = render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('Related conversations', { exact: false }))
    const origin = screen.getByRole('button', { name: 'Origin response' })
    origin.focus()
    fireEvent.keyDown(origin, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('Saved discussion')
    fireEvent.click(screen.getByText('Saved discussion'))
    expect(screen.getByText('Exact reviewed text')).toBeTruthy()
    view.unmount()
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    expect(await screen.findByText('Exact reviewed text')).toBeTruthy()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('opens the saved return artifact rather than preparing a duplicate', async () => {
    mocks.family.mockResolvedValue({
      branches: [branch],
      returns: [
        {
          returnId: 'result',
          branchId: 'branch',
          content: 'Stored result',
          delivery: { status: 'unknown' }
        }
      ]
    })
    render(<PortableConversationFlow request={request} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('Saved result for parent', { exact: false }))
    expect(screen.getByText('Result: Stored result')).toBeTruthy()
    expect(mocks.launch).not.toHaveBeenCalled()
  })
})
