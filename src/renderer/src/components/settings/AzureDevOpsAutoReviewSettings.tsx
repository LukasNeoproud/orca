import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import { useAzureDevOpsAutoReview } from '@/store/azure-devops-auto-review'
import {
  AZURE_DEVOPS_AUTO_REVIEW_MAX_INTERVAL_MINUTES,
  AZURE_DEVOPS_AUTO_REVIEW_MIN_INTERVAL_MINUTES
} from '../../../../shared/azure-devops-auto-review'

/** Turns the periodic check for new pull requests to review on or off, and sets its interval. */
export function AzureDevOpsAutoReviewSettings(): React.JSX.Element {
  const settings = useAzureDevOpsAutoReview((s) => s.settings)
  const setSettings = useAzureDevOpsAutoReview((s) => s.setSettings)
  // Why a local draft: the field must accept an empty value while the user retypes it.
  const [draft, setDraft] = useState(String(settings.intervalMinutes))
  const commit = (): void => {
    const minutes = Number(draft)
    if (draft.trim() && Number.isFinite(minutes)) {
      setSettings({ intervalMinutes: minutes })
    }
    setDraft(String(useAzureDevOpsAutoReview.getState().settings.intervalMinutes))
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="ado-auto-review" className="flex-1">
          {translate(
            'azureDevOpsReview.autoReviewSetting',
            'Offer AI reviews of new pull requests'
          )}
        </Label>
        <Switch
          id="ado-auto-review"
          checked={settings.enabled}
          onCheckedChange={(enabled) => setSettings({ enabled })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'azureDevOpsReview.autoReviewSettingHint',
          'Orca checks for pull requests you have not authored, voted on or reviewed, and offers a review that runs in the background.'
        )}
      </p>
      <div className="flex items-center gap-2">
        <Label htmlFor="ado-auto-review-interval">
          {translate('azureDevOpsReview.autoReviewInterval', 'Check every')}
        </Label>
        <div className="w-20">
          <Input
            id="ado-auto-review-interval"
            type="number"
            min={AZURE_DEVOPS_AUTO_REVIEW_MIN_INTERVAL_MINUTES}
            max={AZURE_DEVOPS_AUTO_REVIEW_MAX_INTERVAL_MINUTES}
            disabled={!settings.enabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit()
              }
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {translate('azureDevOpsReview.autoReviewMinutes', 'minutes')}
        </span>
      </div>
    </div>
  )
}
