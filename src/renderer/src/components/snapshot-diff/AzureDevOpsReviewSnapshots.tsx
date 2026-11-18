import { useCallback, useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { translate } from '@/i18n/i18n'
import { azureDevOpsLoadedSectionFields } from '@/components/azure-devops-review/azure-devops-review-diff-sections'
import { loadAzureDevOpsReviewFileDiff } from '@/components/azure-devops-review/use-azure-devops-review-file-diff'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { snapshotEntriesOfAzureDevOpsChanges } from './azure-devops-snapshot-entries'
import { snapshotImagesOfDiff, type SnapshotDiffEntry } from './snapshot-diff-entries'
import { SnapshotDiffView } from './SnapshotDiffView'

/** The snapshot images a pull request changes, loaded the way its Files view loads them. */
export default function AzureDevOpsReviewSnapshots({
  detail
}: {
  detail: AzureDevOpsReviewDetail
}): JSX.Element {
  const pullRequestKey = detail.pullRequest.key
  const iterationId = detail.latestIteration?.id ?? null
  const snapshots = useMemo(
    () => snapshotEntriesOfAzureDevOpsChanges(detail.changes),
    [detail.changes]
  )
  // Why a ref: the loader must keep its identity when the detail is refetched.
  const latestRef = useRef({ pullRequestKey, iterationId, snapshots })
  useLayoutEffect(() => {
    latestRef.current = { pullRequestKey, iterationId, snapshots }
  })
  const loadImages = useCallback(async (entry: SnapshotDiffEntry) => {
    const latest = latestRef.current
    const change = latest.snapshots.changeByKey.get(entry.key)
    if (!change) {
      return null
    }
    const diff = await loadAzureDevOpsReviewFileDiff(
      latest.pullRequestKey,
      latest.iterationId,
      change
    )
    const result = azureDevOpsLoadedSectionFields(diff).diffResult
    return result ? snapshotImagesOfDiff(result) : null
  }, [])

  return (
    <SnapshotDiffView
      entries={snapshots.entries}
      loadImages={loadImages}
      // A push adds an iteration, which is what changes a file's content here.
      revisionKey={`${pullRequestKey}:${iterationId ?? 'none'}`}
      scopeLabel={translate('snapshotDiff.scopePullRequest', 'in this pull request')}
    />
  )
}
