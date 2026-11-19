import { GitGraph, type LucideIcon } from 'lucide-react'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import type { OpenFile } from '../../store/slices/editor'

/** The icon a tab shows when its mode has none of its own: the git graph's, else the file type's. */
export function editorTabFileIcon(file: Pick<OpenFile, 'mode' | 'filePath'>): LucideIcon {
  return file.mode === 'git-graph' ? GitGraph : getFileTypeIcon(file.filePath)
}
