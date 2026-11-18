import React from 'react'
import type { editor } from 'monaco-editor'
import {
  getExternalEditorAvailableFile,
  getExternalEditorUnavailableReason,
  type ExternalEditorFileAvailability
} from './external-editor-file-availability'
import { useExternalEditorFileTarget } from './external-editor-file-target'
import { ExternalEditorFileGutterMenu } from './ExternalEditorFileGutterMenu'

/** Open in on the modified-side gutter of one combined-diff section. */
export function ExternalEditorDiffSectionGutterMenu({
  editor: codeEditor,
  availability
}: {
  editor: editor.ICodeEditor | null
  availability: ExternalEditorFileAvailability | null
}): React.JSX.Element | null {
  const target = useExternalEditorFileTarget(getExternalEditorAvailableFile(availability))
  return (
    <ExternalEditorFileGutterMenu
      editor={codeEditor}
      target={target}
      unavailableReason={getExternalEditorUnavailableReason(availability)}
    />
  )
}
