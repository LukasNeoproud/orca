import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import type {
  DecoratedDiffComment,
  InlineDiffCommentActions
} from '../diff-comments/decorated-diff-comment'
import type { ExternalEditorFileAvailability } from '../external-editor-file-open/external-editor-file-availability'
import type { DiffSection } from './diff-section-types'

export type DiffSectionItemProps = {
  section: DiffSection
  index: number
  isBranchMode: boolean
  sideBySide: boolean
  isDark: boolean
  settings: {
    terminalFontSize?: number
    terminalFontFamily?: string
    diffWordWrap?: boolean
    diffShowWhitespace?: boolean
  } | null
  sectionHeight: number | undefined
  worktreeId?: string
  loadSection: (index: number) => void
  loadDeferredSection?: (index: number) => void
  retrySection: (index: number) => void
  toggleSection: (index: number) => void
  openSection: (index: number) => void
  openSectionTitle: string
  onOpenPreview?: (section: DiffSection, index: number) => void
  renderHeaderTrailingContent?: (section: DiffSection, index: number) => ReactNode
  onAddLineComment?: (
    section: DiffSection,
    args: { lineNumber: number; startLine?: number; body: string }
  ) => Promise<boolean>
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  inlineComments?: readonly DecoratedDiffComment[]
  inlineCommentActions?: InlineDiffCommentActions
  getCommentableLineNumbers?: (section: DiffSection) => readonly number[] | undefined
  /** The workspace file behind a section's modified side; enables Open in on its gutter. */
  getExternalEditorFile?: (section: DiffSection) => ExternalEditorFileAvailability | null
  /** Inline view of an empty original shows only additions, without Monaco's removed blank line. */
  hideEmptyOriginalLine?: boolean
  setSectionHeights: Dispatch<SetStateAction<Record<number, number>>>
  setSections: Dispatch<SetStateAction<DiffSection[]>>
  modifiedEditorsRef: MutableRefObject<Map<number, monacoEditor.IStandaloneCodeEditor>>
  handleSectionSaveRef: MutableRefObject<(index: number) => Promise<void>>
}
