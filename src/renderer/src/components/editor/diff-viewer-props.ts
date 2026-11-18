import type {
  DecoratedDiffComment,
  InlineDiffCommentActions
} from '../diff-comments/decorated-diff-comment'
import type { ExternalEditorFileSource } from '../external-editor-file-open/external-editor-file-target'
import type { LargeDiffRenderLimit } from './large-diff-render-limit'

export type DiffViewerProps = {
  modelKey: string
  originalModelKey?: string
  modifiedModelKey?: string
  originalContent: string
  modifiedContent: string
  language: string
  filePath: string
  relativePath: string
  sideBySide: boolean
  editable?: boolean
  // Why: optional because DiffViewer is also used by GitHubItemDialog for PR
  // review, where there is no local worktree to attach comments to.
  worktreeId?: string
  /** The workspace file behind the modified side; enables Open in on its gutter lines. */
  externalEditorFile?: ExternalEditorFileSource | null
  /** Shown in the gutter menu when there is no file to open. */
  externalEditorUnavailableReason?: string | null
  onAddLineComment?: (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => Promise<boolean>
  commentableLineNumbers?: readonly number[]
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  // Remote review comments shown in place of the worktree's local notes.
  inlineComments?: readonly DecoratedDiffComment[]
  inlineCommentActions?: InlineDiffCommentActions
  onContentChange?: (content: string) => void
  onSave?: (content: string) => void
  largeDiffRenderLimit?: LargeDiffRenderLimit
  // Why: main-process limited diffs intentionally blank text bodies before IPC;
  // the fallback must not treat that placeholder as a saveable draft.
  largeDiffSaveContentAvailable?: boolean
  /** Inline view of an empty original shows only additions, without Monaco's removed blank line. */
  hideEmptyOriginalLine?: boolean
}
