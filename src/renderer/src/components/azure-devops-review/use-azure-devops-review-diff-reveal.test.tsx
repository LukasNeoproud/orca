// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useAzureDevOpsReviewDiffReveal,
  useAzureDevOpsReviewDiffRevealRequest,
  type AzureDevOpsReviewDiffReveal
} from './use-azure-devops-review-diff-reveal'

type FakeDiffEditor = {
  getContainerDomNode: () => HTMLElement
  getLineChanges: () => unknown[] | null
  getModifiedEditor: () => {
    getModel: () => { getLineCount: () => number; getLineMaxColumn: () => number } | null
    revealLineInCenter: (line: number) => void
    setSelection: (range: unknown) => void
  }
}

const fake = vi.hoisted((): { editors: FakeDiffEditor[] } => ({ editors: [] }))

vi.mock('monaco-editor', () => ({
  editor: { getDiffEditors: () => fake.editors },
  Range: class {
    constructor(
      readonly startLineNumber: number,
      readonly startColumn: number,
      readonly endLineNumber: number,
      readonly endColumn: number
    ) {}
  }
}))

/** A diff editor as the hook reads it: `lineCount` 0 is a file not loaded yet. */
function diffEditorIn(container: HTMLElement, state: { lineCount: number; diffComputed: boolean }) {
  const moves: string[] = []
  const editor: FakeDiffEditor = {
    getContainerDomNode: () => container,
    getLineChanges: () => (state.diffComputed ? [] : null),
    getModifiedEditor: () => ({
      getModel: () =>
        state.lineCount > 0
          ? { getLineCount: () => state.lineCount, getLineMaxColumn: () => 40 }
          : null,
      revealLineInCenter: (line) => moves.push(`reveal ${line}`),
      setSelection: (range) => moves.push(`select ${JSON.stringify(range)}`)
    })
  }
  return { editor, moves }
}

function Pane({
  reveal,
  onFinished
}: {
  reveal: AzureDevOpsReviewDiffReveal | null
  onFinished?: (request: number) => void
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  useAzureDevOpsReviewDiffReveal(box, reveal, onFinished)
  return <div ref={box} data-testid="box" />
}

const LINE_150 = [
  'reveal 150',
  'select {"startLineNumber":150,"startColumn":1,"endLineNumber":150,"endColumn":40}'
]

describe('useAzureDevOpsReviewDiffReveal', () => {
  beforeEach(() => {
    fake.editors = []
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('waits for the file and for its diff, then shows the line after the viewer has scrolled', () => {
    const view = render(<Pane reveal={{ path: 'src/cart.ts', line: 150, request: 1 }} />)
    const state = { lineCount: 0, diffComputed: false }
    const { editor, moves } = diffEditorIn(view.getByTestId('box'), state)
    vi.advanceTimersByTime(300)
    fake.editors = [editor]
    vi.advanceTimersByTime(300)
    state.lineCount = 200
    vi.advanceTimersByTime(300)
    expect(moves).toEqual([])

    // The viewer centres its first change one frame after the diff is computed.
    state.diffComputed = true
    requestAnimationFrame(() => moves.push('viewer scrolls to its first change'))
    vi.advanceTimersByTime(300)
    expect(moves).toEqual(['viewer scrolls to its first change', ...LINE_150])
  })

  it('leaves a file shorter than the asked line alone and spends the request', () => {
    const onFinished = vi.fn()
    const view = render(
      <Pane reveal={{ path: 'src/cart.ts', line: 150, request: 1 }} onFinished={onFinished} />
    )
    const { editor, moves } = diffEditorIn(view.getByTestId('box'), {
      lineCount: 20,
      diffComputed: true
    })
    fake.editors = [editor]
    vi.advanceTimersByTime(10_000)
    expect(moves).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(onFinished).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('ignores a diff editor outside its pane', () => {
    render(<Pane reveal={{ path: 'src/cart.ts', line: 150, request: 1 }} />)
    const { editor, moves } = diffEditorIn(document.createElement('div'), {
      lineCount: 200,
      diffComputed: true
    })
    fake.editors = [editor]
    vi.advanceTimersByTime(10_000)
    expect(moves).toEqual([])
  })

  it('shows the line again for a new request and nothing after the pane is gone', () => {
    const view = render(<Pane reveal={{ path: 'src/cart.ts', line: 150, request: 1 }} />)
    const { editor, moves } = diffEditorIn(view.getByTestId('box'), {
      lineCount: 200,
      diffComputed: true
    })
    fake.editors = [editor]
    vi.advanceTimersByTime(300)
    view.rerender(<Pane reveal={{ path: 'src/cart.ts', line: 150, request: 2 }} />)
    vi.advanceTimersByTime(300)
    expect(moves).toEqual([...LINE_150, ...LINE_150])

    view.rerender(<Pane reveal={{ path: 'src/cart.ts', line: 150, request: 3 }} />)
    view.unmount()
    vi.advanceTimersByTime(300)
    expect(moves).toEqual([...LINE_150, ...LINE_150])
  })

  it('jumps once, not again on the way back to the file or the tab', () => {
    const asked: { reveal?: (path: string, line: number) => void } = {}
    // The page with its Files tab: the pane gets the request only while its file is selected.
    function Page({
      path,
      filesTab
    }: {
      path: string
      filesTab: boolean
    }): React.JSX.Element | null {
      const { reveal, requestReveal, finishReveal } = useAzureDevOpsReviewDiffRevealRequest()
      asked.reveal = requestReveal
      return filesTab ? (
        <Pane reveal={reveal?.path === path ? reveal : null} onFinished={finishReveal} />
      ) : null
    }
    const view = render(<Page path="src/cart.ts" filesTab />)
    const first = diffEditorIn(view.getByTestId('box'), { lineCount: 200, diffComputed: true })
    fake.editors = [first.editor]
    act(() => asked.reveal?.('src/cart.ts', 150))
    act(() => vi.advanceTimersByTime(300))
    expect(first.moves).toEqual(LINE_150)

    view.rerender(<Page path="src/other.ts" filesTab />)
    view.rerender(<Page path="src/cart.ts" filesTab />)
    act(() => vi.advanceTimersByTime(300))
    expect(first.moves).toEqual(LINE_150)

    view.rerender(<Page path="src/cart.ts" filesTab={false} />)
    view.rerender(<Page path="src/cart.ts" filesTab />)
    const second = diffEditorIn(view.getByTestId('box'), { lineCount: 200, diffComputed: true })
    fake.editors = [second.editor]
    act(() => vi.advanceTimersByTime(300))
    expect(second.moves).toEqual([])

    // A new ask still jumps after the spent one was cleared.
    act(() => asked.reveal?.('src/cart.ts', 150))
    act(() => vi.advanceTimersByTime(300))
    expect(second.moves).toEqual(LINE_150)
  })

  it('does nothing without a request', () => {
    const view = render(<Pane reveal={null} />)
    const { editor, moves } = diffEditorIn(view.getByTestId('box'), {
      lineCount: 200,
      diffComputed: true
    })
    fake.editors = [editor]
    vi.advanceTimersByTime(1000)
    expect(moves).toEqual([])
  })
})
