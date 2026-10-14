// @vitest-environment happy-dom
import { act, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeModsDrawContext, type ClaudeModsDrawScope } from './claude-mods-draw-scope'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsNode } from './claude-mods-tree'
import { ClaudeModsNodeView } from './ClaudeModsElement'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const controller = new ClaudeModsSurfaceController(
  {
    request: async () => null,
    subscribe: async () => ({ unsubscribe: () => {} })
  },
  () => {}
)

const tree: ClaudeModsNode = {
  kind: 'element',
  type: 'Box',
  props: { key: 'row', width: 10 },
  children: [{ kind: 'engine', ref: -1 }],
  plugin: 'notes',
  owner: 'notes',
  hover: { backgroundColor: 'red' }
}

// Core's drawing lives in a host portaled from outside the Box, then moved into the Box's slot.
function Harness({ host }: { host: HTMLElement }): React.JSX.Element {
  const attach = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.appendChild(host)
    },
    [host]
  )
  const scope = useMemo<ClaudeModsDrawScope>(
    () => ({
      controller,
      component: 'Transcript',
      instanceId: 't',
      focusRequested: false,
      renderEngine: () => <div ref={attach} data-testid="slot" />
    }),
    [attach]
  )
  return (
    <>
      <ClaudeModsDrawContext.Provider value={scope}>
        <ClaudeModsNodeView node={tree} />
      </ClaudeModsDrawContext.Provider>
      {createPortal(<span data-testid="core">core</span>, host)}
    </>
  )
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function move(from: Element, to: Element | null, ...types: string[]): void {
  for (const type of types) {
    from.dispatchEvent(
      new MouseEvent(type, {
        bubbles: type.endsWith('over') || type.endsWith('out'),
        relatedTarget: to
      })
    )
  }
}

describe('Box hover over core’s drawing', () => {
  it('stays lit while the pointer is over the portaled drawing and goes dark outside', async () => {
    const host = document.createElement('div')
    await act(async () => {
      root.render(<Harness host={host} />)
    })
    const box = container.querySelector<HTMLElement>('[data-claude-mods-plugin="notes"]')
    const core = container.querySelector<HTMLElement>('[data-testid="core"]')
    if (!box || !core) {
      throw new Error('not rendered')
    }
    const resting = box.getAttribute('style')
    // The pointer enters the Box, then moves onto the drawing inside it: no leave for the Box.
    await act(async () => {
      move(box, null, 'pointerover', 'pointerenter')
    })
    const lit = box.getAttribute('style')
    expect(lit).not.toBe(resting)
    await act(async () => {
      move(box, core, 'pointerout')
      move(core, box, 'pointerover')
    })
    expect(box.getAttribute('style')).toBe(lit)
    // Leaving the drawing for outside the Box ends the hover.
    await act(async () => {
      move(core, document.body, 'pointerout')
      move(box, document.body, 'pointerleave')
    })
    expect(box.getAttribute('style')).toBe(resting)
  })

  it('does not leave a context lit when the Box unmounts under the pointer', async () => {
    const host = document.createElement('div')
    await act(async () => {
      root.render(<Harness host={host} />)
    })
    const box = container.querySelector<HTMLElement>('[data-claude-mods-plugin="notes"]')
    if (!box) {
      throw new Error('not rendered')
    }
    let wakes = 0
    const stop = controller.hover.subscribe(() => {
      wakes += 1
    })
    await act(async () => {
      move(box, null, 'pointerover', 'pointerenter')
    })
    await act(async () => {
      root.render(null)
    })
    stop()
    // Lit on enter, dark again once the Box is gone.
    expect(wakes).toBe(2)
  })
})
