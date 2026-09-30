export type ResponseCommentSelectionRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type ResponseCommentSelection = {
  quote: string
  rect: ResponseCommentSelectionRect
}

function selectableOwner(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest<HTMLElement>('[data-response-comment-selectable="true"]') ?? null
}

export function readResponseCommentSelection(
  root: HTMLElement,
  selection: Selection | null = window.getSelection()
): ResponseCommentSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const anchorOwner = selectableOwner(selection.anchorNode)
  const focusOwner = selectableOwner(selection.focusNode)
  if (!anchorOwner || anchorOwner !== focusOwner || !root.contains(anchorOwner)) {
    return null
  }
  const quote = selection.toString()
  if (!quote.trim()) {
    return null
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  return {
    quote,
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    }
  }
}
