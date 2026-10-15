// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { CLAUDE_MODS_WITHHOLD_MS, useClaudeModsCoreWithheld } from './use-claude-mods-core-withhold'
import { ClaudeModsCommandOutputSite } from './ClaudeModsSiteRows'
import { ClaudeModsSite } from './ClaudeModsSite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ENGINE = (ref: number) => ({ type: 'engine', ref })
const text = (value: string) => ({ type: 'Text', children: [value] })
const reply = (tree: unknown, props: Record<string, unknown> = {}) => ({
  tree,
  props,
  rewritten: Object.keys(props).length > 0,
  hooked: true
})
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
  vi.useRealTimers()
})

function controllerWith(answer: (fields: Record<string, unknown>, subtype: string) => unknown) {
  const calls: { subtype: string; fields: Record<string, unknown> }[] = []
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype, fields) => {
        calls.push({ subtype, fields })
        return answer(fields, subtype)
      },
      subscribe: async () => ({ unsubscribe: () => {} })
    },
    () => {}
  )
  return { controller, calls }
}

async function mount(controller: ClaudeModsSurfaceController, node: React.ReactNode) {
  await act(async () => {
    root.render(
      <ClaudeModsControllerContext.Provider value={controller}>
        {node}
      </ClaudeModsControllerContext.Provider>
    )
    await flush()
  })
}

const row = (id: string) => (
  <ClaudeModsSite key={id} component="AssistantMessage" instanceId={id} props={{ text: id }}>
    {(props) => <p data-testid={id}>{String(props.text)}</p>}
  </ClaudeModsSite>
)

describe('core row while a hooked mod has not answered', () => {
  it('is hidden with its space kept until the answer lands', async () => {
    let release: (value: unknown) => void = () => {}
    const { controller } = controllerWith((fields) =>
      fields.instance_id === 'b'
        ? new Promise((resolve) => {
            release = resolve
          })
        : reply(ENGINE(0))
    )
    await mount(
      controller,
      <>
        {row('a')}
        {row('b')}
      </>
    )
    const sites = container.querySelectorAll<HTMLElement>('[data-claude-mods-site]')
    expect(sites).toHaveLength(2)
    expect(sites[0]?.style.visibility).toBe('')
    expect(sites[1]?.style.visibility).toBe('hidden')
    expect(container.querySelector('[data-testid="b"]')).not.toBeNull()

    await act(async () => {
      release(reply({ type: 'Box', props: {}, children: [text('note'), ENGINE(0)] }))
      await flush()
    })
    const shown = container.querySelectorAll<HTMLElement>('[data-claude-mods-site]')[1]
    expect(shown?.style.visibility).toBe('')
    expect(shown?.textContent).toBe('noteb')
  })

  it('draws a remembered answer at once', async () => {
    const { controller } = controllerWith(() => reply(ENGINE(0)))
    await mount(controller, row('a'))
    await mount(controller, null)
    act(() => {
      root.render(
        <ClaudeModsControllerContext.Provider value={controller}>
          {row('a')}
        </ClaudeModsControllerContext.Provider>
      )
    })
    const frame = container.querySelector<HTMLElement>('[data-claude-mods-site]')
    expect(frame).not.toBeNull()
    expect(frame?.style.visibility).toBe('')
  })
})

describe('useClaudeModsCoreWithheld', () => {
  function Probe({ awaiting }: { awaiting: boolean }) {
    return <i>{String(useClaudeModsCoreWithheld(awaiting))}</i>
  }

  it('shows core after five seconds and starts over for the next wait', () => {
    vi.useFakeTimers()
    act(() => root.render(<Probe awaiting />))
    expect(container.textContent).toBe('true')
    act(() => vi.advanceTimersByTime(CLAUDE_MODS_WITHHOLD_MS - 1))
    expect(container.textContent).toBe('true')
    act(() => vi.advanceTimersByTime(1))
    expect(container.textContent).toBe('false')
    act(() => root.render(<Probe awaiting={false} />))
    act(() => root.render(<Probe awaiting />))
    expect(container.textContent).toBe('true')
  })
})

describe('transcript site hotkeys', () => {
  it('presses a drawn Button on its key and ignores a held one', async () => {
    const tree = {
      type: 'Box',
      props: {},
      children: [
        {
          type: 'Button',
          props: { key: 'go', label: 'Go', hotkey: 'y' },
          press: { plugin: 'p', handle: 5 }
        },
        ENGINE(0)
      ]
    }
    const { controller, calls } = controllerWith((_fields, subtype) =>
      subtype === 'ui_render' ? reply(tree) : { handled: true }
    )
    await mount(controller, row('a'))
    const button = container.querySelector('[data-claude-mods-site] button')
    await act(async () => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true, repeat: true }))
      await flush()
    })
    expect(calls.filter((call) => call.subtype === 'ui_press')).toHaveLength(0)
    await act(async () => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }))
      await flush()
    })
    expect(calls.filter((call) => call.subtype === 'ui_press')).toHaveLength(1)
  })
})

describe('ClaudeModsCommandOutputSite', () => {
  it('asks as CommandOutput and draws a rewritten text', async () => {
    const { controller, calls } = controllerWith(() => reply(ENGINE(2), { text: 'reworded' }))
    await mount(
      controller,
      <ClaudeModsCommandOutputSite
        rowId="row-1"
        text="plain"
        renderDrawing={(shown) => <pre>{shown}</pre>}
      />
    )
    expect(calls[0]?.fields).toMatchObject({
      component: 'CommandOutput',
      instance_id: 'row-1',
      props: { text: 'plain', command: '', args: '', isErrored: false }
    })
    expect(container.textContent).toBe('reworded')
  })

  it('draws the text alone without mods', async () => {
    await act(async () => {
      root.render(
        <ClaudeModsCommandOutputSite
          rowId="row-1"
          text="plain"
          renderDrawing={(shown) => <pre>{shown}</pre>}
        />
      )
    })
    expect(container.innerHTML).toBe('<pre>plain</pre>')
  })
})
