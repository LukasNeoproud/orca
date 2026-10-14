// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ClaudeModsSurfaceEvent } from '../../../../../shared/claude-mods-surface'
import type { NativeChatToolCallBlock } from '../../../../../shared/native-chat-types'
import { ClaudeModsControllerContext } from './claude-mods-controller-context'
import { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import { ClaudeModsToolUseSite } from './ClaudeModsSiteRows'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const UNHOOKED = { tree: { type: 'engine', ref: 0 }, props: {}, rewritten: false, hooked: false }

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

function Row({
  controller,
  block,
  working
}: {
  controller: ClaudeModsSurfaceController
  block: NativeChatToolCallBlock
  working: boolean
}) {
  return (
    <ClaudeModsControllerContext.Provider value={controller}>
      <ClaudeModsToolUseSite block={block} result={undefined} activeTurnIsWorking={working}>
        <p>line</p>
      </ClaudeModsToolUseSite>
    </ClaudeModsControllerContext.Provider>
  )
}

describe('transcript rows without a hooking mod', () => {
  it('stop building and comparing tool props once the component is known unhooked', async () => {
    let reads = 0
    let emit: (event: ClaudeModsSurfaceEvent) => void = () => {}
    const controller = new ClaudeModsSurfaceController(
      {
        request: async () => UNHOOKED,
        subscribe: async (handlers) => {
          emit = handlers.onEvent
          return { unsubscribe: () => {} }
        }
      },
      () => {}
    )
    controller.start()
    const block: NativeChatToolCallBlock = {
      type: 'tool-call',
      name: 'Bash',
      callId: 'toolu_1',
      get input() {
        reads += 1
        return { command: 'ls' }
      }
    }
    const draw = (working: boolean) =>
      act(async () => {
        root.render(<Row controller={controller} block={block} working={working} />)
        await flush()
      })
    await draw(true)
    const probed = reads
    expect(probed).toBeGreaterThan(0)
    await draw(false)
    await draw(true)
    expect(reads).toBe(probed)
    expect(container.textContent).toBe('line')

    // A reload of a mod makes the row ask again.
    await act(async () => {
      emit({ type: 'invalidate' })
      await flush()
    })
    expect(reads).toBeGreaterThan(probed)
  })
})
