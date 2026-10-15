// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeModsDrawContext } from '../claude-mods-draw-scope'
import { ClaudeModsSurfaceController } from '../claude-mods-surface-controller'
import { readClaudeModsTree } from '../claude-mods-tree'
import { ClaudeModsClientRegion } from './ClaudeModsClientRegion'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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

function clientNode(plugin: string | undefined) {
  const node = readClaudeModsTree({
    type: 'Client',
    props: { key: 'b1', module: 'hooks/board.jsx', props: { n: 1 }, width: 40, height: 6 },
    ...(plugin ? { part: { plugin } } : {})
  })
  if (node.kind !== 'element') {
    throw new Error('not an element')
  }
  return node
}

function paneScope(controller: ClaudeModsSurfaceController) {
  return { controller, component: 'Pane', instanceId: 'board', focusRequested: false }
}

async function draw(
  reply: unknown,
  node: ReturnType<typeof clientNode>,
  modules?: Record<string, string>
) {
  const requests: string[] = []
  const controller = new ClaudeModsSurfaceController(
    {
      request: async (subtype) => {
        requests.push(subtype)
        return reply
      },
      subscribe: async () => ({ unsubscribe: () => {} })
    },
    () => {}
  )
  const scope = paneScope(controller)
  await act(async () => {
    root.render(
      <ClaudeModsDrawContext.Provider value={scope}>
        <ClaudeModsClientRegion node={node} clientModules={modules} />
      </ClaudeModsDrawContext.Provider>
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return requests
}

describe('ClaudeModsClientRegion', () => {
  it('draws the notice when the host serves no surface modules', async () => {
    const requests = await draw(null, clientNode('board'))
    expect(requests).toEqual(['ui_client_module'])
    expect(container.textContent).toContain('runs its own code')
    const region = container.querySelector<HTMLElement>('[data-claude-mods-client="b1"]')
    expect(region?.style.width).toBe('24em')
    expect(region?.style.height).toBe('8.4em')
  })

  it('draws a fault line for a plugin the drawing loaded no modules for', async () => {
    const requests = await draw({ handled: true }, clientNode('board'), {})
    expect(requests).toEqual(['ui_client_fault'])
    expect(container.textContent).toBe(
      'board: Client hooks/board.jsx: the plugin has no surface module loaded'
    )
  })

  it('draws the notice for a Client whose plugin it cannot tell', async () => {
    const requests = await draw(null, clientNode(undefined))
    expect(requests).toEqual([])
    expect(container.textContent).toContain('runs its own code')
  })
})
