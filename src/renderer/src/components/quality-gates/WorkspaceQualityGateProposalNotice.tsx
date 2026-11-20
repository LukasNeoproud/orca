import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import { Button } from '../ui/button'
import { getRepositoryQualityGatesSectionId } from './quality-gate-settings-target'
import { usePendingQualityGateProposal } from './use-pending-quality-gate-proposal'

type WorkspaceQualityGateProposalNoticeProps = {
  repo: Repo | null
  /** False while the panel is hidden: the host is not asked. */
  visible: boolean
}

/** A line in Local gates while proposed gates wait for the user, linking to where they answer. */
export function WorkspaceQualityGateProposalNotice({
  repo,
  visible
}: WorkspaceQualityGateProposalNoticeProps): React.JSX.Element | null {
  const { proposal } = usePendingQualityGateProposal(repo, visible)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  if (!repo || !proposal) {
    return null
  }
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2"
      data-workspace-quality-gate-proposal={proposal.id}
    >
      <p role="status" className="text-xs text-muted-foreground">
        {translate(
          'qualityGates.proposalWaiting',
          'Proposed gates wait for your review: {{value0}}',
          {
            value0: proposal.items.length
          }
        )}
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        onClick={() => {
          openSettingsTarget({
            pane: 'repo',
            repoId: repo.id,
            // The same id can name a repository on more than one host.
            hostId: getRepoExecutionHostId(repo),
            sectionId: getRepositoryQualityGatesSectionId(repo.id)
          })
          openSettingsPage()
        }}
      >
        {translate('qualityGates.proposalReview', 'Review')}
      </Button>
    </div>
  )
}
