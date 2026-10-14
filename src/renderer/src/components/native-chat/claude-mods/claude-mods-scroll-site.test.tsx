// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { useClaudeModsSite } from './claude-mods-scroll-site'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const observed = new Set<Element>()
class FakeResizeObserver {
  observe(element: Element): void {
    observed.add(element)
  }
  unobserve(element: Element): void {
    observed.delete(element)
  }
  disconnect(): void {
    observed.clear()
  }
}

const requests: [string, Record<string, unknown>][] = []
const controller = new ClaudeModsSurfaceController(
  {
    request: async (subtype: string, fields: Record<string, unknown>) => {
      requests.push([subtype, fields])
      return null
    },
    subscribe: async () => ({ unsubscribe: () => {} })
  },
  () => {}
)

function Harness({ drawing }: { drawing: string }): React.JSX.Element {
  const site = useClaudeModsSite({ controller, component: 'Pane', instanceId: 'p', drawing })
  return (
    <div ref={site.setElement} data-testid="body" style={{ fontSize: '10px' }}>
      <div key={drawing} data-root={drawing} />
    </div>
  )
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  requests.length = 0
  observed.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const render = (drawing: string): Promise<void> =>
  act(async () => {
    root.render(<Harness drawing={drawing} />)
  })

function body(): HTMLElement {
  const element = host.firstElementChild
  if (!(element instanceof HTMLElement)) {
    throw new Error('no body')
  }
  return element
}

function measurable(element: HTMLElement, sizes: Record<string, number>): void {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(element, name, { value, configurable: true, writable: true })
  }
}

describe('useClaudeModsSite', () => {
  it('keeps the engine row offset by turning off scroll anchoring', async () => {
    await render('a')
    expect(body().style.overflowAnchor).toBe('none')
  })

  it('watches the content root a redraw put in place of the old one', async () => {
    await render('a')
    const first = body().firstElementChild
    expect(first && observed.has(first)).toBe(true)
    await render('b')
    const second = body().firstElementChild
    expect(second).not.toBe(first)
    expect(second && observed.has(second)).toBe(true)
    expect(first && observed.has(first)).toBe(false)
  })

  it('does not report a clamp after the content shrank as the person scrolling', async () => {
    await render('a')
    const element = body()
    // 14px rows: scrolled to row 20 of 40 with a 20-row window.
    measurable(element, { clientHeight: 280, scrollHeight: 560, scrollTop: 280 })
    element.dispatchEvent(new Event('scroll'))
    element.dispatchEvent(new Event('wheel'))
    // The content shrinks to 30 rows; the browser clamps the window to row 10.
    measurable(element, { scrollHeight: 420, scrollTop: 140 })
    await render('b')
    element.dispatchEvent(new Event('scroll'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(requests.filter(([subtype]) => subtype === 'ui_scroll')).toEqual([])
  })

  it('still reports a wheel scroll', async () => {
    await render('a')
    const element = body()
    measurable(element, { clientHeight: 280, scrollHeight: 560, scrollTop: 0 })
    element.dispatchEvent(new Event('scroll'))
    element.dispatchEvent(new Event('wheel'))
    measurable(element, { scrollTop: 56 })
    element.dispatchEvent(new Event('scroll'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(requests.filter(([subtype]) => subtype === 'ui_scroll')).toHaveLength(1)
    expect(requests.find(([subtype]) => subtype === 'ui_scroll')?.[1]).toMatchObject({ by: 4 })
  })
})
