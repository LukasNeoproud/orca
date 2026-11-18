import { Suspense, useMemo, type JSX } from 'react'
import { TabsContent, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import type { AzureDevOpsReviewDetail } from '../../../../shared/azure-devops-review-types'
import { snapshotEntriesOfAzureDevOpsChanges } from './azure-devops-snapshot-entries'

const AzureDevOpsReviewSnapshots = lazy(() => import('./AzureDevOpsReviewSnapshots'))

const AZURE_DEVOPS_SNAPSHOTS_TAB = 'snapshots'

/** The pull request page's Snapshots tab; absent while the PR changes no snapshot image. */
export function AzureDevOpsSnapshotsTabTrigger({
  detail
}: {
  detail: AzureDevOpsReviewDetail
}): JSX.Element | null {
  const count = useMemo(
    () => snapshotEntriesOfAzureDevOpsChanges(detail.changes).entries.length,
    [detail.changes]
  )
  if (count === 0) {
    return null
  }
  return (
    <TabsTrigger value={AZURE_DEVOPS_SNAPSHOTS_TAB}>
      {translate('snapshotDiff.openCount', 'Snapshots ({{value0}})', { value0: count })}
    </TabsTrigger>
  )
}

export function AzureDevOpsSnapshotsTabContent({
  detail
}: {
  detail: AzureDevOpsReviewDetail
}): JSX.Element {
  return (
    <TabsContent value={AZURE_DEVOPS_SNAPSHOTS_TAB} className="min-h-0 flex-1">
      <Suspense fallback={null}>
        <AzureDevOpsReviewSnapshots detail={detail} />
      </Suspense>
    </TabsContent>
  )
}
