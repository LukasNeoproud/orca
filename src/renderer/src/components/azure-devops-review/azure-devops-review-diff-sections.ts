import {
  MAX_RENDERED_DIFF_COMBINED_CHARACTERS,
  MAX_RENDERED_DIFF_LINES_PER_SIDE,
  getLargeDiffRenderLimit,
  type LargeDiffRenderLimit
} from '@/components/editor/large-diff-render-limit'
import type { DiffSection } from '@/components/editor/diff-section-types'
import { getCombinedDiffFileTreeSectionKey } from '../editor/combined-diff/resolve-changes/combined-diff-section-identity'
import type { GitBranchChangeEntry, GitDiffResult } from '../../../../shared/git-diff-compare-types'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewFileDiff
} from '../../../../shared/azure-devops-review-types'

export function azureDevOpsChangeToBranchEntry(
  change: AzureDevOpsReviewChange
): GitBranchChangeEntry {
  const status =
    change.changeType === 'add'
      ? 'added'
      : change.changeType === 'delete'
        ? 'deleted'
        : change.changeType === 'rename'
          ? 'renamed'
          : 'modified'
  return {
    path: change.path,
    status,
    ...(change.originalPath ? { oldPath: change.originalPath } : {})
  }
}

export function azureDevOpsPendingSection(entry: GitBranchChangeEntry): DiffSection {
  return {
    key: getCombinedDiffFileTreeSectionKey('commit', entry),
    path: entry.path,
    oldPath: entry.oldPath,
    status: entry.status,
    originalContent: '',
    modifiedContent: '',
    collapsed: false,
    loading: true,
    error: undefined,
    dirty: false,
    diffResult: null,
    largeDiffRenderLimit: null
  }
}

function renderLimitFor(diff: AzureDevOpsReviewFileDiff): LargeDiffRenderLimit {
  if (!diff.original.tooLarge && !diff.modified.tooLarge) {
    return getLargeDiffRenderLimit({
      originalContent: diff.original.content,
      modifiedContent: diff.modified.content
    })
  }
  // Why: the host refused a side, so force the fallback instead of diffing a truncated file.
  return {
    limited: true,
    reason: 'character-count',
    lineCounts: null,
    characterCount: MAX_RENDERED_DIFF_COMBINED_CHARACTERS + 1,
    limits: {
      maxLinesPerSide: MAX_RENDERED_DIFF_LINES_PER_SIDE,
      maxCombinedCharacters: MAX_RENDERED_DIFF_COMBINED_CHARACTERS
    }
  }
}

/** The loaded fields of a section; large bodies are dropped once the fallback takes over. */
export function azureDevOpsLoadedSectionFields(
  diff: AzureDevOpsReviewFileDiff
): Pick<
  DiffSection,
  'diffResult' | 'originalContent' | 'modifiedContent' | 'largeDiffRenderLimit' | 'loading'
> {
  if (diff.original.binary || diff.modified.binary) {
    const diffResult: GitDiffResult = diff.original.binary
      ? {
          kind: 'binary',
          originalContent: '',
          modifiedContent: '',
          originalIsBinary: true,
          modifiedIsBinary: diff.modified.binary
        }
      : {
          kind: 'binary',
          originalContent: '',
          modifiedContent: '',
          originalIsBinary: false,
          modifiedIsBinary: true
        }
    return {
      diffResult,
      originalContent: '',
      modifiedContent: '',
      largeDiffRenderLimit: null,
      loading: false
    }
  }
  const limit = renderLimitFor(diff)
  const limited = limit.limited
  return {
    diffResult: {
      kind: 'text',
      originalContent: limited ? '' : diff.original.content,
      modifiedContent: limited ? '' : diff.modified.content,
      originalIsBinary: false,
      modifiedIsBinary: false
    },
    originalContent: limited ? '' : diff.original.content,
    modifiedContent: limited ? '' : diff.modified.content,
    largeDiffRenderLimit: limit,
    loading: false
  }
}
