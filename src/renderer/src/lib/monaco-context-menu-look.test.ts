// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { adoptMenuLook, watchEditorMenuLook } from './monaco-context-menu-look'

type Listener = () => void

function createFakeEditor(initial: HTMLElement | null) {
  let domNode = initial
  const modelListeners = new Set<Listener>()
  const disposeListeners = new Set<Listener>()
  return {
    editor: {
      getDomNode: () => domNode,
      onDidChangeModel: (listener: Listener) => {
        modelListeners.add(listener)
        return { dispose: () => modelListeners.delete(listener) }
      },
      onDidDispose: (listener: Listener) => {
        disposeListeners.add(listener)
        return { dispose: () => disposeListeners.delete(listener) }
      }
    },
    swapModel(next: HTMLElement | null) {
      domNode = next
      modelListeners.forEach((listener) => listener())
    },
    dispose() {
      disposeListeners.forEach((listener) => listener())
    }
  }
}

function appendShadowHost(parent: HTMLElement): ShadowRoot {
  const host = document.createElement('div')
  host.className = 'shadow-root-host'
  const root = host.attachShadow({ mode: 'open' })
  parent.append(host)
  return root
}

const flushObservers = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('watchEditorMenuLook', () => {
  it('adopts the sheet into a menu host Monaco adds after the editor mounts', async () => {
    const sheet = new CSSStyleSheet()
    const domNode = document.createElement('div')
    const fake = createFakeEditor(domNode)
    watchEditorMenuLook(fake.editor, () => sheet)

    const root = appendShadowHost(domNode)
    await flushObservers()

    expect(root.adoptedStyleSheets).toEqual([sheet])
  })

  it('adopts into a host that already exists and ignores other children', async () => {
    const sheet = new CSSStyleSheet()
    const domNode = document.createElement('div')
    const root = appendShadowHost(domNode)
    const other = document.createElement('div')
    const otherRoot = other.attachShadow({ mode: 'open' })
    domNode.append(other)

    watchEditorMenuLook(createFakeEditor(domNode).editor, () => sheet)
    await flushObservers()

    expect(root.adoptedStyleSheets).toEqual([sheet])
    expect(otherRoot.adoptedStyleSheets).toEqual([])
  })

  it('follows the editor to the DOM node of a new model and stops after disposal', async () => {
    const sheet = new CSSStyleSheet()
    const first = document.createElement('div')
    const second = document.createElement('div')
    const fake = createFakeEditor(null)
    watchEditorMenuLook(fake.editor, () => sheet)

    fake.swapModel(first)
    fake.swapModel(second)
    const staleRoot = appendShadowHost(first)
    const currentRoot = appendShadowHost(second)
    await flushObservers()
    expect(staleRoot.adoptedStyleSheets).toEqual([])
    expect(currentRoot.adoptedStyleSheets).toEqual([sheet])

    fake.dispose()
    const afterDispose = appendShadowHost(second)
    await flushObservers()
    expect(afterDispose.adoptedStyleSheets).toEqual([])
  })
})

describe('adoptMenuLook', () => {
  it('keeps Monaco sheets and does not add the same sheet twice', () => {
    const monacoSheet = new CSSStyleSheet()
    const sheet = new CSSStyleSheet()
    const root = document.createElement('div').attachShadow({ mode: 'open' })
    root.adoptedStyleSheets = [monacoSheet]

    adoptMenuLook(root, sheet)
    adoptMenuLook(root, sheet)

    expect(root.adoptedStyleSheets).toEqual([monacoSheet, sheet])
  })
})
