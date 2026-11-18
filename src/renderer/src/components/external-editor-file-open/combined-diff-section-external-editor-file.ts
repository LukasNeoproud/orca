import { joinPath } from '@/lib/path'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffSection } from '../editor/diff-section-types'
import {
  describeDeletedExternalEditorFile,
  type ExternalEditorFileAvailability
} from './external-editor-file-availability'

/** The workspace file behind one section of a workspace's combined diff. */
export function getCombinedDiffSectionExternalEditorFile(
  combinedDiff: Pick<
    OpenFile,
    'filePath' | 'worktreeId' | 'runtimeEnvironmentId' | 'externalSshTargetId'
  >,
  section: Pick<DiffSection, 'path' | 'status'>
): ExternalEditorFileAvailability {
  if (section.status === 'deleted') {
    return { unavailableReason: describeDeletedExternalEditorFile() }
  }
  return {
    file: {
      // Why: a combined diff tab's filePath is the workspace root.
      filePath: joinPath(combinedDiff.filePath, section.path),
      worktreeId: combinedDiff.worktreeId,
      runtimeEnvironmentId: combinedDiff.runtimeEnvironmentId,
      externalSshTargetId: combinedDiff.externalSshTargetId
    }
  }
}
