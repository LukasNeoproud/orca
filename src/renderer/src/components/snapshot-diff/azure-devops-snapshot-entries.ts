import { azureDevOpsChangeToBranchEntry } from '@/components/azure-devops-review/azure-devops-review-diff-sections'
import type { AzureDevOpsReviewChange } from '../../../../shared/azure-devops-review-types'
import { toSnapshotDiffEntry, type SnapshotDiffEntry } from './snapshot-diff-entries'

/** The snapshot images among a pull request's changed files, each keyed back to its change. */
export function snapshotEntriesOfAzureDevOpsChanges(changes: readonly AzureDevOpsReviewChange[]): {
  entries: SnapshotDiffEntry[]
  changeByKey: ReadonlyMap<string, AzureDevOpsReviewChange>
} {
  const entries: SnapshotDiffEntry[] = []
  const changeByKey = new Map<string, AzureDevOpsReviewChange>()
  for (const change of changes) {
    const { status, oldPath } = azureDevOpsChangeToBranchEntry(change)
    const entry = toSnapshotDiffEntry({ key: change.path, path: change.path, oldPath, status })
    if (entry && !changeByKey.has(entry.key)) {
      entries.push(entry)
      changeByKey.set(entry.key, change)
    }
  }
  return { entries, changeByKey }
}
