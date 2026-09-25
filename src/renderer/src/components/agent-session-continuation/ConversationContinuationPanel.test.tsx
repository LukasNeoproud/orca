// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  reference: vi.fn(),
  candidateReference: vi.fn(),
  assertReferenceSupported: vi.fn(),
  launch: vi.fn(),
  agent: 'codex' as 'codex' | 'claude',
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
  referenceContinuationCandidate: mocks.candidateReference,
  assertContinuationCandidateReferenceSupported: mocks.assertReferenceSupported,
  claimContinuationCandidate: mocks.used
}))
vi.mock('./use-continuation-target-agent', () => ({
  useContinuationTargetAgent: () => ({
    selectedAgent: mocks.agent,
    setSelectedAgent: vi.fn(),
    agents: ['codex', 'claude'],
    detecting: false,
    error: null,
    launch: mocks.launch
  })
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
  mocks.candidateReference.mockReset()
  mocks.assertReferenceSupported.mockReset()
  mocks.launch.mockReset()
  mocks.agent = 'codex'
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
  let button = [...document.body.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text)
  )
  if (!button) {
    const trigger = [...container.querySelectorAll('button')].find((element) =>
      element.textContent?.includes('Continue…')
    )!
    await act(async () => trigger.click())
    button = [...document.body.querySelectorAll('button')].find((element) =>
      element.textContent?.includes(text)
    )
  }
  expect(button, `button ${text}`).toBeDefined()
  await act(async () => button!.click())
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
describe('ConversationContinuationPanel', () => {
  it('does not compact or launch when the owner cannot provide a compacted reference', async () => {
    mocks.agent = 'claude'
    mocks.assertReferenceSupported.mockRejectedValue(new Error('Update the owning runtime'))
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={vi.fn()} />
      )
    )
    await click('Compact and pass a reference')
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Update the owning runtime')
  })
  it('cancels a pending cross-agent launch when the menu is dismissed', async () => {
    mocks.agent = 'claude'
    const reference = deferred<{ reference: string }>()
    mocks.reference.mockReturnValue(reference.promise)
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={vi.fn()} />
      )
    )
    await click('New with reference')
    await click('Continue…')
    await act(async () => {
      reference.resolve({ reference: 'snapshot' })
      await reference.promise
    })
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it.each([
    ['Compact and pass a reference', 'compacted snapshot'],
    ['New with reference', 'original snapshot'],
    ['Empty conversation', undefined]
  ] as const)('launches another agent with the correct context for %s', async (label, expected) => {
    mocks.agent = 'claude'
    mocks.inspect.mockResolvedValue({
      ...view,
      candidate: { ...readyCandidate, compactionOrigin: 'automatic' }
    })
    mocks.reference.mockResolvedValue({ reference: 'original snapshot' })
    mocks.candidateReference.mockResolvedValue({ reference: 'compacted snapshot' })
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue…')
    expect(document.body.textContent).toContain('Prepared automatically')
    await click(label)
    expect(mocks.launch).toHaveBeenCalledExactlyOnceWith('claude', expected, expect.any(Function))
    expect(onContinue).not.toHaveBeenCalled()
    expect(mocks.used).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    if (expected === 'compacted snapshot') {
      expect(mocks.candidateReference).toHaveBeenCalledExactlyOnceWith(
        source.target,
        source,
        'r1',
        'copy'
      )
      expect(mocks.reference).not.toHaveBeenCalled()
    } else {
      expect(mocks.candidateReference).not.toHaveBeenCalled()
    }
  })
  it('does not infer automatic origin from the current setting', async () => {
    mocks.inspect.mockResolvedValue({ ...view, autoCompact: true, candidate: readyCandidate })
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={vi.fn()} />
      )
    )
    await click('Continue…')
    expect(document.body.textContent).toContain('Prepared')
    expect(document.body.textContent).not.toContain('Prepared automatically')
  })
  it('offers an idle conversation without invoking compaction or suggesting the original when auto compact is off', async () => {
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    expect(container.textContent).toContain('Continue…')
    await click('Continue…')
    expect(document.body.textContent).toContain('New with reference')
    expect(document.body.textContent).not.toContain('Continue original')
    expect(mocks.prepare).not.toHaveBeenCalled()
    await click('Empty conversation')
    expect(onContinue).toHaveBeenCalledExactlyOnceWith('fresh')
  })
  it('never offers an original action even when auto compact is enabled', async () => {
    mocks.inspect.mockResolvedValue({ ...view, autoCompact: true })
    const onContinue = vi.fn()
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue…')
    expect(onContinue).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Continue original')
  })
  it('replaces handoff with a target picker and keeps split as a labeled toolbar action', async () => {
    const onContinue = vi.fn()
    const terminalActions = {
      onToggleNativeChat: vi.fn(),
      onSplitPane: vi.fn()
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

    expect(container.textContent).toContain('View: Terminal')
    expect(container.textContent).toContain('Split Terminal Right')
    expect(container.textContent).not.toContain('Close Pane')
    await click('Split Terminal Right')
    expect(terminalActions.onSplitPane).toHaveBeenCalledOnce()
    await click('Continue…')
    expect(document.body.textContent).toContain('Target agent')
    expect(document.body.textContent).toContain('Empty conversation')
    expect(document.body.textContent).not.toContain('handoff')
    expect(onContinue).not.toHaveBeenCalled()
  })
  it('shows the selected view in a dropdown and only switches on the other choice', async () => {
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

    expect(container.textContent).toContain('View: Chat')
    const viewTrigger = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('View: Chat')
    )!
    await act(async () => {
      viewTrigger.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })
      )
    })
    const selected = document.body.querySelector('[role="menuitemradio"][data-state="checked"]')
    expect(selected?.textContent).toContain('Chat')
    const terminal = [...document.body.querySelectorAll('[role="menuitemradio"]')].find((item) =>
      item.textContent?.includes('Terminal')
    ) as HTMLElement
    await act(async () => terminal.click())
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
    await click('Continue with compacted context')
    expect(onContinue).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Wait for the current turn')
  })
  it('claims a ready copy before attempting a launch and never automatically retries it', async () => {
    mocks.inspect.mockResolvedValue({ ...view, candidate: readyCandidate })
    const onContinue = vi.fn().mockRejectedValue(new Error('Launch refused'))
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )
    await click('Continue with compacted context')
    expect(mocks.used).toHaveBeenCalledWith(source.target, 'copy')
    expect(document.body.textContent).toContain('Launch refused')
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

    await click('Continue with compacted context')

    expect(document.body.textContent).toContain(outcome.expected)
    expect(onContinue).not.toHaveBeenCalled()
    const original = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Empty conversation')
    ) as HTMLButtonElement
    expect(original.disabled).toBe(false)
    await click('Empty conversation')
    expect(onContinue).toHaveBeenCalledExactlyOnceWith('fresh')
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

    await click('Continue with compacted context')

    expect(mocks.used).toHaveBeenCalledExactlyOnceWith(source.target, 'copy')
    expect(onContinue).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Copy was already selected elsewhere.')
  })

  it('shows recovery instead of allowing a duplicate after claim succeeds and launch fails', async () => {
    mocks.inspect.mockResolvedValue({ ...view, candidate: readyCandidate })
    const onContinue = vi.fn().mockRejectedValue(new Error('Launch refused after claim'))
    await act(async () =>
      root.render(
        <ConversationContinuationPanel source={source} busy={false} onContinue={onContinue} />
      )
    )

    await click('Continue with compacted context')

    expect(onContinue).toHaveBeenCalledExactlyOnceWith('compacted', {
      providerSessionId: 'copy-thread',
      transcriptPath: '/copy.jsonl'
    })
    const selected = [...document.body.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Copy selected')
    ) as HTMLButtonElement
    expect(selected.disabled).toBe(true)
    expect(document.body.textContent).toContain('reopen it from Session History')
    expect(document.body.textContent).toContain('Launch refused after claim')
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

    await click('Continue with compacted context')
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
    expect(document.body.textContent).toContain('Finish or stop the current turn')
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

    await click('Continue with compacted context')
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
