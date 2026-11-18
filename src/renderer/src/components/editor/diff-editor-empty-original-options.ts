import type { editor } from 'monaco-editor'

/**
 * Monaco diffs an empty original as one removed blank line, so an added file opens with a red
 * empty row in the inline view. Its true-inline rendering accepts exactly that change without
 * the removed-lines zone; it is only enabled for an empty original, where no other change exists.
 */
export function buildDiffEditorEmptyOriginalOptions(
  hideEmptyOriginalLine: boolean | undefined,
  originalContent: string
): Pick<editor.IStandaloneDiffEditorConstructionOptions, 'experimental'> {
  if (hideEmptyOriginalLine !== true) {
    return {}
  }
  // Why: always send the flag so a section whose original gains text turns it back off.
  return { experimental: { useTrueInlineView: originalContent === '' } }
}
