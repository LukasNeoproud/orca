import { useEffect, useState, type RefObject } from 'react'
import * as monaco from 'monaco-editor'

/** A line of a changed file to show in the Files tab; `request` tells two asks for one line apart. */
export type AzureDevOpsReviewDiffReveal = { path: string; line: number; request: number }

const ATTEMPT_INTERVAL_MS = 100
// Why bounded: a file whose diff cannot be shown (binary, too large, failed) never gets an editor.
const MAX_ATTEMPTS = 60

/** What the pull request page needs to send the user from a draft to a line in the Files tab. */
export function useAzureDevOpsReviewDiffRevealRequest(): {
  reveal: AzureDevOpsReviewDiffReveal | null
  requestReveal: (path: string, line: number) => void
} {
  const [reveal, setReveal] = useState<AzureDevOpsReviewDiffReveal | null>(null)
  return {
    reveal,
    requestReveal: (path, line) =>
      setReveal((current) => ({ path, line, request: (current?.request ?? 0) + 1 }))
  }
}

/**
 * Scrolls the diff editor inside `box` to the asked line of the new side and selects it. The
 * editor mounts after the file is loaded, so the line is looked for until it is there.
 */
export function useAzureDevOpsReviewDiffReveal(
  box: RefObject<HTMLElement | null>,
  reveal: Pick<AzureDevOpsReviewDiffReveal, 'line' | 'request'> | null
): void {
  const line = reveal?.line
  const request = reveal?.request
  useEffect(() => {
    if (line === undefined) {
      return
    }
    let attempts = 0
    let timer = 0
    let frame = 0
    const show = (modified: monaco.editor.ICodeEditor): void => {
      const model = modified.getModel()
      if (model && model.getLineCount() >= line) {
        modified.revealLineInCenter(line)
        modified.setSelection(new monaco.Range(line, 1, line, model.getLineMaxColumn(line)))
      }
    }
    const attempt = (): void => {
      const container = box.current
      const diffEditor = container
        ? monaco.editor
            .getDiffEditors()
            .find((editor) => container.contains(editor.getContainerDomNode()))
        : undefined
      const modified = diffEditor?.getModifiedEditor()
      const lineCount = modified?.getModel()?.getLineCount() ?? 0
      if (diffEditor && modified && lineCount >= line && diffEditor.getLineChanges() !== null) {
        // Why two frames: the viewer centres its first change a frame after the diff is computed
        // and would undo a reveal made before that.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => show(modified))
        })
        return
      }
      attempts += 1
      if (attempts < MAX_ATTEMPTS) {
        timer = window.setTimeout(attempt, ATTEMPT_INTERVAL_MS)
      }
    }
    timer = window.setTimeout(attempt, 0)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [box, line, request])
}
