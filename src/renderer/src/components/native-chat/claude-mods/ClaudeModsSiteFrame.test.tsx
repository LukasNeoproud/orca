// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ClaudeModsSurfaceEvent } from '../../../../../shared/claude-mods-surface'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { useClaudeModsTranscriptViewport } from './claude-mods-transcript-viewport'
import { ClaudeModsSpinnerSite } from './ClaudeModsSiteRows'
import { ClaudeModsSite } from './ClaudeModsSite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const ENGINE = (ref: number) => ({ type: 'engine', ref })
const text = (value: string) => ({ type: 'Text', children: [value] })
const around = (child: unknown) => ({ type: 'Box', props: {}, children: [text('note'), child] })
const reply = (tree: unknown) => ({ tree, props: {}, rewritten: false, hooked: true })
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function liveController(answer: () => unknown) {
  const requests: { subtype: string; fields: Record<string, unknown> }[] = []
  let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype, fields) => {
        requests.push({ subtype, fields })
        return answer()
      },
      subscribe: async (handlers) => {
        emit = handlers.onEvent
        return { unsubscribe: () => {} }
      }
    },
    () => {}
  )
  controller.start()
  return { controller, requests, emit: (event: ClaudeModsSurfaceEvent) => emit(event) }
}

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button type="button" data-testid="counter" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}

const counterSite = (
  <ClaudeModsSite component="ToolUse" instanceId="t1" props={{ tool: 'Bash' }}>
    {() => <Counter />}
  </ClaudeModsSite>
)

async function render(controller: ClaudeModsSurfaceController | null, node: React.ReactNode) {
  await act(async () => {
    root.render(
      <ClaudeModsControllerContext.Provider value={controller}>
        {node}
      </ClaudeModsControllerContext.Provider>
    )
    await flush()
  })
}

describe('ClaudeModsSite frame', () => {
  it('keeps the row state while a mod starts and stops drawing around it', async () => {
    let tree: unknown = ENGINE(0)
    const { controller, emit } = liveController(() => reply(tree))
    await render(controller, counterSite)
    const button = (): HTMLElement | null => container.querySelector('[data-testid="counter"]')
    await act(async () => button()?.click())
    expect(button()?.textContent).toBe('1')
    const before = button()

    tree = around(ENGINE(0))
    await act(async () => {
      emit({ type: 'invalidate' })
      await flush()
    })
    expect(container.textContent).toBe('note1')
    expect(button()).toBe(before)

    tree = ENGINE(0)
    await act(async () => {
      emit({ type: 'invalidate' })
      await flush()
    })
    expect(container.textContent).toBe('1')
    expect(button()).toBe(before)
  })

  it('keeps the row state across a new child clearing every answer', async () => {
    const { controller, emit } = liveController(() => reply(around(ENGINE(0))))
    await render(controller, counterSite)
    await act(async () => container.querySelector<HTMLElement>('[data-testid="counter"]')?.click())
    await act(async () => {
      emit({
        type: 'state',
        available: true,
        roster: { panes: [], shown_id: null, focused_id: null, focus_requested_id: null },
        statuses: {}
      })
      await flush()
    })
    expect(container.querySelector('[data-testid="counter"]')?.textContent).toBe('1')
  })

  it('draws a row remounted by the virtualizer from its last answer, without asking again', async () => {
    const { controller, requests } = liveController(() => reply(around(ENGINE(0))))
    await render(controller, counterSite)
    expect(container.textContent).toContain('note')
    const renders = (): number => requests.filter((entry) => entry.subtype === 'ui_render').length
    const asked = renders()
    await render(controller, null)
    expect(container.textContent).toBe('')
    // No await: the very first paint of the remount already holds the mod's drawing.
    act(() => {
      root.render(
        <ClaudeModsControllerContext.Provider value={controller}>
          {counterSite}
        </ClaudeModsControllerContext.Provider>
      )
    })
    expect(container.textContent).toBe('note0')
    await act(async () => flush())
    expect(renders()).toBe(asked)
  })

  it('keeps the element an aria-labelledby points at when a mod draws the spinner alone', async () => {
    const { controller } = liveController(() =>
      reply({ type: 'Box', props: {}, children: [text('mod')] })
    )
    await render(
      controller,
      <div>
        <ClaudeModsSpinnerSite
          label="Thinking…"
          mode="thinking"
          renderDrawing={(label) => <span id="activity-label">{label}</span>}
        />
        <button type="button" aria-labelledby="activity-label" />
      </div>
    )
    expect(container.textContent).toContain('mod')
    const label = document.getElementById('activity-label')
    expect(label?.textContent).toBe('Thinking…')
    expect(label?.closest('[hidden], [style*="display: none"]')).not.toBeNull()
  })
})

describe('transcript viewport', () => {
  it('reports the column before the rows send their first asks', async () => {
    const { controller, requests } = liveController(() => reply(ENGINE(0)))
    function Dock({ attached }: { attached: boolean }) {
      const ref = useClaudeModsTranscriptViewport(attached ? controller : null)
      return (
        <div ref={ref}>
          <ClaudeModsControllerContext.Provider value={attached ? controller : null}>
            <ClaudeModsSite component="ToolUse" instanceId="t1" props={{}}>
              {() => <p>row</p>}
            </ClaudeModsSite>
          </ClaudeModsControllerContext.Provider>
        </div>
      )
    }
    await act(async () => {
      root.render(<Dock attached={false} />)
      await flush()
    })
    await act(async () => {
      root.render(<Dock attached />)
      await flush()
    })
    const first = requests.find((request) => request.subtype === 'ui_render')
    expect(first?.fields.viewport).toBeDefined()
  })
})
