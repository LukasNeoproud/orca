import type * as Monaco from 'monaco-editor'
import menuLookCss from './monaco-context-menu-look.css?inline'

type MenuLookEditor = {
  getDomNode(): HTMLElement | null
  onDidChangeModel(listener: () => void): Monaco.IDisposable
  onDidDispose(listener: () => void): Monaco.IDisposable
}

type MenuLookMonaco = {
  editor: {
    onDidCreateEditor: (listener: (editor: MenuLookEditor) => void) => Monaco.IDisposable
  }
}

// Monaco appends this host to the editor's DOM node and draws the context menu in its shadow root.
const SHADOW_HOST_CLASS = 'shadow-root-host'

let installed = false
let sharedSheet: CSSStyleSheet | null = null

function menuLookSheet(): CSSStyleSheet {
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet()
    sharedSheet.replaceSync(menuLookCss)
  }
  return sharedSheet
}

export function adoptMenuLook(root: ShadowRoot, sheet: CSSStyleSheet = menuLookSheet()): void {
  if (!root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
}

function adoptIntoHosts(nodes: Iterable<Node>, sheet: CSSStyleSheet): void {
  for (const node of nodes) {
    if (
      node instanceof HTMLElement &&
      node.classList.contains(SHADOW_HOST_CLASS) &&
      node.shadowRoot
    ) {
      adoptMenuLook(node.shadowRoot, sheet)
    }
  }
}

/** Keeps every menu Monaco opens in `editor` dressed like Orca's menus, across model swaps. */
export function watchEditorMenuLook(editor: MenuLookEditor, sheet: () => CSSStyleSheet): void {
  let observer: MutationObserver | null = null
  const observe = (): void => {
    observer?.disconnect()
    observer = null
    // The view, and with it the DOM node, is rebuilt whenever the model changes.
    const domNode = editor.getDomNode()
    if (!domNode) {
      return
    }
    adoptIntoHosts(domNode.children, sheet())
    observer = new MutationObserver((records) => {
      for (const record of records) {
        adoptIntoHosts(record.addedNodes, sheet())
      }
    })
    observer.observe(domNode, { childList: true })
  }
  const modelListener = editor.onDidChangeModel(observe)
  editor.onDidDispose(() => {
    modelListener.dispose()
    observer?.disconnect()
    observer = null
  })
  observe()
}

/** Dresses Monaco's context menus in Orca's menu tokens; idempotent. */
export function installMonacoContextMenuLook(monaco: MenuLookMonaco): void {
  if (installed || typeof CSSStyleSheet === 'undefined') {
    return
  }
  installed = true
  monaco.editor.onDidCreateEditor((editor) => watchEditorMenuLook(editor, menuLookSheet))
}
