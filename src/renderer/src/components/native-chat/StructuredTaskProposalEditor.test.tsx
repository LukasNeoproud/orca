// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StructuredTaskProposal } from '../../../../shared/structured-task-proposal'
import { StructuredTaskProposalEditor } from './StructuredTaskProposalEditor'

const proposal: StructuredTaskProposal = {
  proposalId: 'proposal-1',
  source: {
    sessionId: 'source-session',
    workspaceId: 'workspace-1',
    kind: 'prompt',
    anchor: { epoch: 'epoch-1', itemId: 'source-message' },
    passages: [{ itemId: 'source-message', text: 'Do two things.' }]
  },
  items: [
    {
      itemId: 'item-1',
      branchId: 'branch-1',
      name: 'Export invoices',
      scope: 'Add export.',
      verification: 'Download the CSV.',
      dependencyIds: [],
      workspaceId: 'workspace-1',
      context: { content: 'Only invoice export context.', sourceItemIds: ['source-message'] },
      relationKind: 'subtask',
      action: 'prepare',
      uncertain: false
    },
    {
      itemId: 'item-2',
      branchId: 'branch-2',
      name: 'Fix login',
      scope: 'Fix login.',
      verification: 'Reproduce and sign in.',
      dependencyIds: [],
      workspaceId: 'workspace-1',
      context: { content: 'Only login context.', sourceItemIds: ['source-message'] },
      relationKind: 'subtask',
      action: 'prepare',
      uncertain: true
    }
  ],
  shouldOffer: true,
  analysis: 'deterministic',
  truncated: false
}

const props = {
  open: true,
  proposal,
  workspaces: [
    { workspaceId: 'workspace-1', name: 'Main' },
    { workspaceId: 'workspace-2', name: 'Follow-up' }
  ],
  relatedThreads: [
    { sessionId: 'thread-1', title: 'Existing login investigation', workspaceId: 'workspace-1' }
  ],
  onOpenChange: vi.fn()
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StructuredTaskProposalEditor', () => {
  it('submits edited context and dependencies with stable item and branch IDs', async () => {
    const onPrepareBatch = vi.fn().mockResolvedValue({
      items: [
        { itemId: 'item-1', branchId: 'branch-1', status: 'prepared' },
        { itemId: 'item-2', branchId: 'branch-2', status: 'prepared' }
      ]
    })
    render(<StructuredTaskProposalEditor {...props} onPrepareBatch={onPrepareBatch} />)
    const first = screen.getByRole('region', { name: 'Proposal 1' })
    fireEvent.change(within(first).getByLabelText('Name'), {
      target: { value: 'Export paid invoices' }
    })
    fireEvent.change(within(first).getByLabelText('Targeted context'), {
      target: { value: 'Paid invoice fields and CSV format.' }
    })
    fireEvent.click(within(first).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare threads' }))

    await waitFor(() => expect(onPrepareBatch).toHaveBeenCalledTimes(1))
    expect(onPrepareBatch.mock.calls[0]?.[0]).toMatchObject({
      proposalId: 'proposal-1',
      items: [
        {
          itemId: 'item-1',
          branchId: 'branch-1',
          name: 'Export paid invoices',
          dependencyIds: ['item-2'],
          context: { content: 'Paid invoice fields and CSV format.' }
        },
        { itemId: 'item-2', branchId: 'branch-2' }
      ]
    })
    expect(await screen.findAllByText('Prepared')).toHaveLength(2)
  })

  it('merges related outcomes while retaining the first durable identity', async () => {
    const onPrepareBatch = vi.fn().mockResolvedValue({
      items: [{ itemId: 'item-1', branchId: 'branch-1', status: 'prepared' }]
    })
    render(<StructuredTaskProposalEditor {...props} onPrepareBatch={onPrepareBatch} />)
    fireEvent.click(screen.getByRole('button', { name: 'Merge with previous' }))
    expect(screen.getAllByRole('region', { name: /Proposal/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare threads' }))
    await waitFor(() => expect(onPrepareBatch).toHaveBeenCalled())
    expect(onPrepareBatch.mock.calls[0]?.[0].items[0]).toMatchObject({
      itemId: 'item-1',
      branchId: 'branch-1'
    })
    expect(onPrepareBatch.mock.calls[0]?.[0].items[0].scope).toContain('Fix login.')
  })

  it('attaches a proposal to an existing related thread without preparing a replacement', async () => {
    const onPrepareBatch = vi.fn().mockResolvedValue({
      items: [
        { itemId: 'item-1', branchId: 'branch-1', status: 'attached', targetSessionId: 'thread-1' },
        { itemId: 'item-2', branchId: 'branch-2', status: 'prepared' }
      ]
    })
    render(<StructuredTaskProposalEditor {...props} onPrepareBatch={onPrepareBatch} />)
    const first = screen.getByRole('region', { name: 'Proposal 1' })
    fireEvent.click(within(first).getByRole('combobox', { name: 'Action' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Attach related thread' }))
    fireEvent.click(within(first).getByRole('combobox', { name: 'Related thread' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Existing login investigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare threads' }))

    await waitFor(() => expect(onPrepareBatch).toHaveBeenCalled())
    expect(onPrepareBatch.mock.calls[0]?.[0].items[0]).toMatchObject({
      itemId: 'item-1',
      branchId: 'branch-1',
      action: 'attach',
      targetSessionId: 'thread-1'
    })
  })

  it('reports partial outcomes and retries an unknown item with the same identity and payload', async () => {
    const onPrepareBatch = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ itemId: 'item-1', branchId: 'branch-1', status: 'prepared' }]
      })
      .mockResolvedValueOnce({
        items: [{ itemId: 'item-2', branchId: 'branch-2', status: 'prepared' }]
      })
    render(<StructuredTaskProposalEditor {...props} onPrepareBatch={onPrepareBatch} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prepare threads' }))
    expect(await screen.findByText('Status unknown')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check / retry' }))
    await waitFor(() => expect(onPrepareBatch).toHaveBeenCalledTimes(2))
    expect(onPrepareBatch.mock.calls[1]?.[0].items).toEqual([
      onPrepareBatch.mock.calls[0]?.[0].items[1]
    ])
    expect(await screen.findAllByText('Prepared')).toHaveLength(2)
  })

  it('does not resubmit while the batch callback is still pending', async () => {
    let finish: ((value: { items: [] }) => void) | undefined
    const onPrepareBatch = vi.fn(
      () =>
        new Promise<{ items: [] }>((resolve) => {
          finish = resolve
        })
    )
    render(<StructuredTaskProposalEditor {...props} onPrepareBatch={onPrepareBatch} />)
    const prepare = screen.getByRole('button', { name: 'Prepare threads' })
    fireEvent.click(prepare)
    fireEvent.click(prepare)
    expect(onPrepareBatch).toHaveBeenCalledTimes(1)
    await act(async () => finish?.({ items: [] }))
  })
})
