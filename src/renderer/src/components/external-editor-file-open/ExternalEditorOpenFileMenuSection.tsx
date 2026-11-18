import React from 'react'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { isVirtualEditorFile } from '@/store/slices/editor/tabs/editor-tab-content-type'
import { useExternalEditorFileTarget } from './external-editor-file-target'
import { ExternalEditorFileOpenMenuItems } from './ExternalEditorFileOpenMenuItems'

/** Open in items for the file of an editor tab; nothing for a tab with no file on disk. */
export function ExternalEditorOpenFileMenuSection({
  filePath,
  line,
  leadingSeparator
}: {
  filePath: string
  /** 1-based line the menu was invoked on. */
  line?: number
  leadingSeparator?: boolean
}): React.JSX.Element | null {
  const file = useAppStore((s) => s.openFiles.find((f) => f.filePath === filePath) ?? null)
  const target = useExternalEditorFileTarget(file && !isVirtualEditorFile(file) ? file : null)
  if (!target) {
    return null
  }
  return (
    <>
      {leadingSeparator ? <DropdownMenuSeparator /> : null}
      <ExternalEditorFileOpenMenuItems target={target} line={line} />
    </>
  )
}
