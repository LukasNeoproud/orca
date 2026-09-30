import { useCallback, useRef, useState, type RefObject } from 'react'
import {
  readResponseCommentSelection,
  type ResponseCommentSelection
} from './response-comment-selection'

export function useResponseCommentSelection(rootRef: RefObject<HTMLElement | null>): {
  selection: ResponseCommentSelection | null
  captureSelection: () => void
  dismissSelection: () => void
  dismissIfIdle: () => void
  onEditingChange: (editing: boolean) => void
} {
  const [selection, setSelection] = useState<ResponseCommentSelection | null>(null)
  const editingRef = useRef(false)

  const captureSelection = useCallback(() => {
    if (editingRef.current || !rootRef.current) {
      return
    }
    setSelection(readResponseCommentSelection(rootRef.current))
  }, [rootRef])
  const dismissSelection = useCallback(() => setSelection(null), [])
  const dismissIfIdle = useCallback(() => {
    if (!editingRef.current) {
      setSelection(null)
    }
  }, [])
  const onEditingChange = useCallback((editing: boolean) => {
    editingRef.current = editing
  }, [])

  return { selection, captureSelection, dismissSelection, dismissIfIdle, onEditingChange }
}
