import { useEffect } from 'react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import {
  checkAzureDevOpsReviewOffers,
  offerAzureDevOpsReview
} from '@/lib/azure-devops-auto-review-check'
import { runAzureDevOpsReviewInBackground } from '@/lib/azure-devops-review-background-run'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import {
  readAzureDevOpsReviewOptions,
  storeAzureDevOpsReviewOptions
} from '@/store/azure-devops-review-options'
import { AzureDevOpsReviewOptionsDialog } from './AzureDevOpsReviewOptionsDialog'

// Why a delay: the first check should not compete with restoring the workspace session.
const FIRST_CHECK_DELAY_MS = 20_000

/** Checks for new pull requests on the configured interval and runs accepted reviews. */
export function AzureDevOpsAutoReviewHost({ ready }: { ready: boolean }): React.JSX.Element | null {
  const enabled = useAzureDevOpsAutoReview((s) => s.settings.enabled)
  const intervalMinutes = useAzureDevOpsAutoReview((s) => s.settings.intervalMinutes)
  const choosingOptionsFor = useAzureDevOpsAutoReview((s) => s.choosingOptionsFor)
  const confirm = useConfirmationDialog()

  useEffect(() => {
    if (!ready || !enabled) {
      return
    }
    const first = setTimeout(() => void checkAzureDevOpsReviewOffers(), FIRST_CHECK_DELAY_MS)
    const interval = setInterval(
      () => void checkAzureDevOpsReviewOffers(),
      intervalMinutes * 60_000
    )
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [ready, enabled, intervalMinutes])

  if (!choosingOptionsFor) {
    return null
  }
  const close = (): void => useAzureDevOpsAutoReview.getState().chooseOptionsFor(null)
  return (
    <AzureDevOpsReviewOptionsDialog
      subject={translate('azureDevOpsReview.autoReviewSubject', '!{{value0}} {{value1}}', {
        value0: choosingOptionsFor.pullRequestId,
        value1: choosingOptionsFor.title
      })}
      initialOptions={readAzureDevOpsReviewOptions()}
      onCancel={() => {
        close()
        // Cancelling the dialog keeps the pull request on offer.
        offerAzureDevOpsReview(choosingOptionsFor)
      }}
      onStart={(options) => {
        close()
        storeAzureDevOpsReviewOptions(options)
        useAzureDevOpsAutoReview.getState().markHandled([choosingOptionsFor.key])
        void runAzureDevOpsReviewInBackground(choosingOptionsFor, options, confirm)
      }}
    />
  )
}
