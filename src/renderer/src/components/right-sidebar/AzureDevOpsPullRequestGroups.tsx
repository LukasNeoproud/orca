import { translate } from '@/i18n/i18n'
import { openAzureDevOpsPullRequestPage } from '@/lib/azure-devops-review-page'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import type { ReviewInvolvement } from '../../../../shared/azure-devops-review-groups'
import type { AzureDevOpsReviewPullRequest } from '../../../../shared/azure-devops-review-types'
import { AzureDevOpsPullRequestRow } from './AzureDevOpsPullRequestRow'

const GROUP_LABELS: Record<ReviewInvolvement, () => string> = {
  'awaiting-my-review': () =>
    translate('azureDevOpsReview.groupAwaitingMyReview', 'Waiting for my review'),
  mine: () => translate('azureDevOpsReview.groupMine', 'My pull requests'),
  other: () => translate('azureDevOpsReview.groupOther', 'Other')
}

export function AzureDevOpsPullRequestGroups({
  groups,
  visibleGroups,
  draftCounts,
  showOrganization,
  openKey
}: {
  groups: Record<ReviewInvolvement, AzureDevOpsReviewPullRequest[]>
  visibleGroups: readonly ReviewInvolvement[]
  draftCounts: Record<string, number>
  showOrganization: boolean
  openKey: string | null
}): React.JSX.Element {
  const unopenedKeys = useAzureDevOpsAutoReview((s) => s.unopenedKeys)
  return (
    <div className="flex flex-col gap-2 p-1">
      {visibleGroups.map((group) => (
        <section key={group} aria-label={GROUP_LABELS[group]()} data-review-group={group}>
          <h3 className="flex items-center gap-1.5 px-2 py-1 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            <span className="min-w-0 truncate">{GROUP_LABELS[group]()}</span>
            <span className="tabular-nums">{groups[group].length}</span>
          </h3>
          <ul className="flex flex-col gap-px">
            {groups[group].map((pr) => (
              <li key={pr.key}>
                <AzureDevOpsPullRequestRow
                  pullRequest={pr}
                  draftCount={draftCounts[pr.key] ?? 0}
                  isNew={unopenedKeys.has(pr.key)}
                  showOrganization={showOrganization}
                  selected={openKey === pr.key}
                  onOpen={() => openAzureDevOpsPullRequestPage(pr.key)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
