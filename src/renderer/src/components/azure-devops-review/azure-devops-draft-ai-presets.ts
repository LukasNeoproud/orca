import { translate } from '@/i18n/i18n'

/** One-click instructions for the checks and rewrites reviewers ask for most. */
export function azureDevOpsDraftAiPresets(): { id: string; label: string; text: string }[] {
  return [
    {
      id: 'verify',
      label: translate('azureDevOpsReview.aiPresetVerify', 'Verify'),
      text: translate(
        'azureDevOpsReview.aiPresetVerifyText',
        'Verify the claim against the code; fix the draft if it is wrong or delete it if it no longer applies.'
      )
    },
    {
      id: 'concise',
      label: translate('azureDevOpsReview.aiPresetConcise', 'Shorten'),
      text: translate(
        'azureDevOpsReview.aiPresetConciseText',
        'Make the comment shorter and clearer without losing the point.'
      )
    },
    {
      id: 'fix',
      label: translate('azureDevOpsReview.aiPresetFix', 'Suggest fix'),
      text: translate(
        'azureDevOpsReview.aiPresetFixText',
        'Add a concrete suggested fix, with a short code snippet when it helps.'
      )
    },
    {
      id: 'tone',
      label: translate('azureDevOpsReview.aiPresetTone', 'Soften tone'),
      text: translate(
        'azureDevOpsReview.aiPresetToneText',
        'Rephrase it as a friendly, constructive suggestion for the author.'
      )
    }
  ]
}
