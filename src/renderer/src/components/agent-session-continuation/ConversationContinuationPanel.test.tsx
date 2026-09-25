// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  reference: vi.fn(),
  used: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ settings: { conversationContinuationOfferAfterMs: 60_000 } })
}))
vi.mock('@/lib/conversation-continuation-client', () => ({
  inspectContinuation: mocks.inspect,
  prepareContinuation: mocks.prepare,
  referenceContinuation: mocks.reference,
  claimContinuationCandidate: mocks.used
}))
import { ConversationContinuationPanel } from './ConversationContinuationPanel'
const source = {
  providerSessionId: 'thread',
  workspaceId: 'workspace',
  target: { kind: 'local' as const }
}
const checkpoint = { lastTurnId: 'turn', completedAt: '2020-01-01T00:00:00Z', revision: 'r1' }
const view = { source, checkpoint, candidate: null, autoCompact: false }
const readyCandidate = {
  candidateId: 'copy',
  status: 'ready' as const,
  checkpoint,
  providerSessionId: 'copy-thread',
  transcriptPath: '/copy.jsonl'
}
const usedCandidate = { ...readyCandidate, status: 'used' as const }
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.inspect.mockReset()
  mocks.prepare.mockReset()
  mocks.reference.mockReset()
  mocks.used.mockReset()
  mocks.inspect.mockResolvedValue(view)
  mocks.used.mockResolvedValue(usedCandidate)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text)
  )!
  await act(async () => button.click())
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
describe('ConversationContinuationPanel', () => {
  it('offers an idle conversation without invoking compaction or suggesting the original when auto compact is off', async () => {
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    expect(container.textContent).toContain('New with reference')
    expect(container.textContent).not.toContain('Continue original')
    expect(mocks.prepare).not.toHaveBeenCalled()
    await click('New conversation')
    expect(onContinue).toHaveBeenCalledExactlyOnceWith('fresh')
  })
  it('offers the original choice when auto compact is enabled', async () => {
    mocks.inspect.mockResolvedValue({ ...view, autoCompact: true })
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue original')
    expect(onContinue).toHaveBeenCalledWith('original')
    expect(container.textContent).not.toContain('New with reference')
  })
  it('shows labeled terminal actions beside continuation and invokes each action', async () => {
    const onContinue = vi.fn()
    const terminalActions = {
      onContinueInNewSession: vi.fn(),
      onToggleNativeChat: vi.fn(),
      onSplitPane: vi.fn(),
      onClosePane: vi.fn(),
      closeLabel: 'Close this pane'
    }
    await act(async () =>
      root.render(
        <ConversationContinuationPanel
          source={source}
          busy={false}
          onContinue={onContinue}
          terminalActions={terminalActions}
        />
      )
    )

    for (const [label, callback] of [
      ['New session with handoff…', terminalActions.onContinueInNewSession],
      ['Show chat view', terminalActions.onToggleNativeChat],
      ['Split Terminal Right', terminalActions.onSplitPane],
      ['Close this pane', terminalActions.onClosePane]
    ] as const) {
      const button = [...container.querySelectorAll('button')].find(
        (element) => element.textContent === label
      )
      expect(button?.querySelector('svg')).not.toBeNull()
      await click(label)
      expect(callback).toHaveBeenCalledOnce()
    }
    expect(container.textContent).toContain('New conversation')
    expect(onContinue).not.toHaveBeenCalled()

    await click('Conversation continuation')
    expect(container.textContent).not.toContain('New conversation')
    expect(container.textContent).toContain('New session with handoff…')
  })
  it('labels the chat toggle according to the active view', async () => {
    const onToggleNativeChat = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel
          source={source}
          busy={false}
          onContinue={vi.fn()}
          terminalActions={{ onToggleNativeChat, isChatViewMode: true }}
        />
      )
    )

    const button = [...container.querySelectorAll('button')].find(
      (element) => element.textContent === 'Show terminal'
    ) as HTMLButtonElement
    expect(button.getAttribute('aria-pressed')).toBe('true')
    await click('Show terminal')
    expect(onToggleNativeChat).toHaveBeenCalledOnce()
  })
  it('does not switch when the source changed since a ready candidate was displayed', async () => {
    mocks.inspect.mockResolvedValueOnce({ ...view, candidate: readyCandidate }).mockResolvedValue({
      ...view,
      checkpoint: null,
      candidate: { ...readyCandidate, status: 'stale' }
    })
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue compacted')
    expect(onContinue).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Wait for the current turn')
  })
  it('claims a ready copy before attempting a launch and never automatically retries it', async () => {
    mocks.inspect.mockResolvedValue({ ...view, candidate: readyCandidate })
    const onContinue = vi.fn().mockRejectedValue(new Error('Launch refused'))
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue compacted')
    expect(mocks.used).toHaveBeenCalledWith(source.target, 'copy')
    expect(container.textContent).toContain('Launch refused')
  })

  it.each([
    {
      status: 'failed',
      error: 'Compaction was refused.',
      expected: 'Compaction was refused.'
    },
    {
      status: 'unconfirmed',
      error: undefined,
      expected: 'Preparation could not be confirmed'
    }
  ] as const)('keeps the original available after $status preparation', async (outcome) => {
    mocks.inspect.mockResolvedValue({ ...view, autoCompact: true })
    mocks.prepare.mockResolvedValue({
      ...readyCandidate,
      status: outcome.status,
      error: outcome.error
    })
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Compact a copy')

    expect(container.textContent).toContain(outcome.expected)
    expect(onContinue).not.toHaveBeenCalled()
    const original = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Continue original')
    ) as HTMLButtonElement
    expect(original.disabled).toBe(false)
    await click('Continue original')
    expect(onContinue).toHaveBeenCalledExactlyOnceWith('original')
  })

  it('does not switch when claiming a ready copy is rejected', async () => {
    mocks.inspect.mockResolvedValue({ ...view, candidate: readyCandidate })
    mocks.used.mockRejectedValue(new Error('Copy was already selected elsewhere.'))
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Continue compacted')

    expect(mocks.used).toHaveBeenCalledExactlyOnceWith(source.target, 'copy')
    expect(onContinue).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Copy was already selected elsewhere.')
  })

  it('shows recovery instead of allowing a duplicate after claim succeeds and launch fails', async () => {
    mocks.inspect.mockResolvedValue({ ...view, candidate: readyCandidate })
    const onContinue = vi.fn().mockRejectedValue(new Error('Launch refused after claim'))
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Continue compacted')

    expect(onContinue).toHaveBeenCalledExactlyOnceWith('compacted', {
      providerSessionId: 'copy-thread',
      transcriptPath: '/copy.jsonl'
    })
    const selected = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Copy selected')
    ) as HTMLButtonElement
    expect(selected.disabled).toBe(true)
    expect(container.textContent).toContain('reopen it from Session History')
    expect(container.textContent).toContain('Launch refused after claim')
  })

  it('does not switch when the conversation becomes busy during a checkpoint refresh', async () => {
    const latest = deferred<typeof view>()
    mocks.inspect.mockResolvedValueOnce(view).mockReturnValueOnce(latest.promise)
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Compact a copy')
    await act(async () => {
      root.render(
        <ConversationContinuationPanel source={source} busy={true} onContinue={onContinue} />
      )
    })
    await act(async () => {
      latest.resolve(view)
      await latest.promise
    })

    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.used).not.toHaveBeenCalled()
    expect(onContinue).not.toHaveBeenCalled()
    expect(container.textContent).toContain('The active conversation changed')
  })

  it('does not switch a claimed copy into a replacement source identity', async () => {
    const claimed = deferred<typeof usedCandidate>()
    const replacementSource = {
      providerSessionId: 'thread-replacement',
      workspaceId: 'workspace-replacement',
      target: { kind: 'environment' as const, environmentId: 'replacement-owner' }
    }
    mocks.inspect.mockImplementation(async (_target, requested) =>
      requested.providerSessionId === source.providerSessionId
        ? { ...view, candidate: readyCandidate }
        : {
            source: requested,
            checkpoint: null,
            candidate: null,
            autoCompact: false
          }
    )
    mocks.used.mockReturnValue(claimed.promise)
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Continue compacted')
    expect(mocks.used).toHaveBeenCalled()
    await act(async () => {
      root.render(
        <ConversationContinuationPanel
          source={replacementSource}
          busy={false}
          onContinue={onContinue}
        />
      )
    })
    await act(async () => {
      claimed.resolve(structuredClone(usedCandidate))
      await claimed.promise
    })

    expect(onContinue).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
})
