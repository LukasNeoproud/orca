// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AzureDevOpsReviewPublishResult } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsReviewPublishDialog } from './AzureDevOpsReviewPublishDialog'

const publish = vi.hoisted(() => vi.fn())
const refreshList = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('@/lib/azure-devops-review-client', () => ({ publishAzureDevOpsReviewDrafts: publish }))
vi.mock('@/store/azure-devops-review-store', () => ({
  useAzureDevOpsReviewStore: { getState: () => ({ list: {}, refresh: refreshList }) }
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
// Why a native select: Radix Select needs pointer capture and layout that happy-dom lacks.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select
      aria-label="Your vote"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null
}))

const pullRequest = { key: 'dev.azure.com/contoso+repo+7', myVote: 'none' as const }
const ok = (draftId: string) => ({ draftId, ok: true, error: null })

function open(options: { draftIds?: string[]; voteOffered?: boolean } = {}) {
  const onClose = vi.fn()
  const onPublished = vi.fn(async () => undefined)
  const view = render(
    <AzureDevOpsReviewPublishDialog
      pullRequest={pullRequest}
      draftIds={options.draftIds ?? ['d1', 'd2']}
      voteOffered={options.voteOffered ?? true}
      onClose={onClose}
      onPublished={onPublished}
    />
  )
  return { onClose, onPublished, view }
}

const publishButton = (): HTMLElement => screen.getByRole('button', { name: 'Publish' })
const chooseVote = (value: string): void => {
  fireEvent.change(screen.getByLabelText('Your vote'), { target: { value } })
}

describe('AzureDevOpsReviewPublishDialog', () => {
  beforeEach(() => {
    publish.mockReset()
    refreshList.mockReset()
    toastSuccess.mockReset()
  })
  afterEach(cleanup)

  it('offers the four votes with leaving the vote unchanged as the default', () => {
    open()

    const picker = screen.getByLabelText<HTMLSelectElement>('Your vote')
    expect(picker.value).toBe('keep')
    expect([...picker.options].map((option) => option.text)).toEqual([
      'Leave my vote unchanged',
      'Approve',
      'Approve with suggestions',
      'Wait for author',
      'Reject'
    ])
  })

  it('says what is sent before anything is sent', () => {
    open()
    const summary = screen.getByRole('list', { name: 'What is sent' })

    expect(summary.textContent).toContain('Comments to post: 2')
    expect(summary.textContent).toContain('Your vote is not changed.')
    chooseVote('rejected')
    expect(summary.textContent).toContain('Your vote changes from No vote to Rejected.')
    expect(summary.textContent).toContain('The vote is sent after the comments')
    expect(publish).not.toHaveBeenCalled()
  })

  it('sends the comments without a vote unless one is chosen', async () => {
    publish.mockResolvedValue({ results: [ok('d1'), ok('d2')] })
    const { onClose, onPublished } = open()

    fireEvent.click(publishButton())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenCalledWith(pullRequest.key, ['d1', 'd2'], null)
    expect(onPublished).toHaveBeenCalledTimes(1)
    expect(refreshList).not.toHaveBeenCalled()
  })

  it('sends the chosen vote with the comments and refreshes the list', async () => {
    publish.mockResolvedValue({
      results: [ok('d1'), ok('d2')],
      vote: { vote: 'approved', status: 'sent', error: null }
    } satisfies AzureDevOpsReviewPublishResult)
    const { onClose } = open()

    chooseVote('approved')
    fireEvent.click(publishButton())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenCalledWith(pullRequest.key, ['d1', 'd2'], 'approved')
    expect(refreshList).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith('Published 2 comments and set your vote to Approved.')
  })

  it('sends a vote alone and refuses to send nothing', async () => {
    publish.mockResolvedValue({
      results: [],
      vote: { vote: 'waiting-for-author', status: 'sent', error: null }
    } satisfies AzureDevOpsReviewPublishResult)
    const { onClose } = open({ draftIds: [] })

    expect(publishButton()).toHaveProperty('disabled', true)
    chooseVote('waiting-for-author')
    fireEvent.click(publishButton())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenCalledWith(pullRequest.key, [], 'waiting-for-author')
  })

  it('sends once when Publish is clicked twice', async () => {
    let finish: (result: AzureDevOpsReviewPublishResult) => void = () => undefined
    publish.mockReturnValue(
      new Promise<AzureDevOpsReviewPublishResult>((resolve) => {
        finish = resolve
      })
    )
    const { onClose } = open()
    chooseVote('approved')
    const button = publishButton()

    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toHaveProperty('disabled', true)
    finish({
      results: [ok('d1'), ok('d2')],
      vote: { vote: 'approved', status: 'sent', error: null }
    })

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('keeps an incomplete result on screen and offers no way to resend from it', async () => {
    publish.mockResolvedValue({
      results: [ok('d1'), { draftId: 'd2', ok: false, error: 'HTTP 500' }],
      vote: { vote: 'approved', status: 'skipped', error: null }
    } satisfies AzureDevOpsReviewPublishResult)
    const { onClose, onPublished } = open()

    chooseVote('approved')
    fireEvent.click(publishButton())

    const report = await screen.findByRole('alert')
    expect(report.textContent).toContain('Comments posted: 1')
    expect(report.textContent).toContain('Comments not posted: 1')
    expect(report.textContent).toContain('Your vote was not sent, because a comment was not posted')
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(onPublished).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(refreshList).not.toHaveBeenCalled()
    // The first Close is the report's own button; the dialog corner has another.
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('starts from an unchanged vote again when publishing is retried', async () => {
    publish.mockResolvedValue({
      results: [{ draftId: 'd1', ok: false, error: 'HTTP 500' }],
      vote: { vote: 'approved', status: 'skipped', error: null }
    } satisfies AzureDevOpsReviewPublishResult)
    const first = open({ draftIds: ['d1'] })
    chooseVote('approved')
    fireEvent.click(publishButton())
    await screen.findByRole('alert')
    first.view.unmount()

    publish.mockResolvedValue({ results: [ok('d1')] })
    const retry = open({ draftIds: ['d1'] })
    expect(screen.getByLabelText<HTMLSelectElement>('Your vote').value).toBe('keep')
    fireEvent.click(publishButton())

    await waitFor(() => expect(retry.onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenLastCalledWith(pullRequest.key, ['d1'], null)
  })

  it('reports a vote the host said nothing about as not sent', async () => {
    publish.mockResolvedValue({ results: [ok('d1'), ok('d2')] })
    open()

    chooseVote('approved')
    fireEvent.click(publishButton())

    const report = await screen.findByRole('alert')
    expect(report.textContent).toContain('Comments posted: 2')
    expect(report.textContent).toContain('cannot cast votes yet')
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('shows the reason when the host refuses the whole publish', async () => {
    publish.mockRejectedValue(new Error('Nothing was published: the pull request is closed.'))
    const { onPublished } = open()

    chooseVote('approved')
    fireEvent.click(publishButton())

    const report = await screen.findByRole('alert')
    expect(report.textContent).toBe('Nothing was published: the pull request is closed.')
    expect(onPublished).toHaveBeenCalledTimes(1)
  })

  it('has no vote picker and sends no vote when a vote is not offered', async () => {
    publish.mockResolvedValue({ results: [ok('d1'), ok('d2')] })
    const { onClose } = open({ voteOffered: false })

    expect(screen.queryByLabelText('Your vote')).toBeNull()
    expect(screen.getByRole('list', { name: 'What is sent' }).textContent).toBe(
      'Comments to post: 2'
    )
    fireEvent.click(publishButton())

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(publish).toHaveBeenCalledWith(pullRequest.key, ['d1', 'd2'], null)
  })
})
