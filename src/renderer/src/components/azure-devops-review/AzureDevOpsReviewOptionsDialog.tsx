import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import {
  AZURE_DEVOPS_REVIEW_CHECKS,
  normalizeAzureDevOpsReviewOptions,
  type AzureDevOpsReviewCheck,
  type AzureDevOpsReviewDepth,
  type AzureDevOpsReviewLanguage,
  type AzureDevOpsReviewOptions,
  type AzureDevOpsReviewPermissions,
  type AzureDevOpsReviewSurface
} from '../../../../shared/azure-devops-review-options'

function checkLabel(check: AzureDevOpsReviewCheck): { title: string; hint: string } {
  switch (check) {
    case 'lint':
      return {
        title: translate('azureDevOpsReview.checkLint', 'Linters and format checks'),
        hint: translate(
          'azureDevOpsReview.checkLintHint',
          "Runs the repository's linters on the changed files."
        )
      }
    case 'full-test-suite':
      return {
        title: translate('azureDevOpsReview.checkFullTests', 'Full test suite'),
        hint: translate(
          'azureDevOpsReview.checkFullTestsHint',
          'Runs every test, not only those near the change. Can take a long time.'
        )
      }
    case 'dependency-audit':
      return {
        title: translate('azureDevOpsReview.checkDependencies', 'Dependency audit'),
        hint: translate(
          'azureDevOpsReview.checkDependenciesHint',
          'Checks added or upgraded packages for known vulnerabilities. Needs network access.'
        )
      }
    case 'security':
      return {
        title: translate('azureDevOpsReview.checkSecurity', 'Security pass'),
        hint: translate(
          'azureDevOpsReview.checkSecurityHint',
          'A dedicated read for injection, auth, secrets and input validation.'
        )
      }
  }
}

/** Collects language, depth and extra checks before an AI review starts. */
export function AzureDevOpsReviewOptionsDialog({
  subject,
  initialOptions,
  onStart,
  onCancel
}: {
  /** The pull request, when the dialog opens away from its page. */
  subject?: string
  initialOptions: AzureDevOpsReviewOptions
  onStart: (options: AzureDevOpsReviewOptions) => void
  onCancel: () => void
}): React.JSX.Element {
  const [options, setOptions] = useState(initialOptions)
  const update = (patch: Partial<AzureDevOpsReviewOptions>): void =>
    setOptions((current) => ({ ...current, ...patch }))
  const runsCode = options.depth !== 'static'
  const toggleCheck = (check: AzureDevOpsReviewCheck, checked: boolean): void =>
    update({
      checks: checked
        ? [...options.checks, check]
        : options.checks.filter((existing) => existing !== check)
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('azureDevOpsReview.optionsTitle', 'AI review')}</DialogTitle>
          {subject ? <p className="truncate text-sm font-medium">{subject}</p> : null}
          <DialogDescription>
            {translate(
              'azureDevOpsReview.optionsDescription',
              'The agent writes findings as drafts in this language. Building and testing run in the shared review workspace.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ado-review-language">
              {translate('azureDevOpsReview.optionsLanguage', 'Comment language')}
            </Label>
            <Select
              value={options.language}
              onValueChange={(value) => update({ language: value as AzureDevOpsReviewLanguage })}
            >
              <SelectTrigger id="ado-review-language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cs">
                  {translate('azureDevOpsReview.languageCs', 'Czech')}
                </SelectItem>
                <SelectItem value="en">
                  {translate('azureDevOpsReview.languageEn', 'English')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ado-review-depth">
              {translate('azureDevOpsReview.optionsDepth', 'Review depth')}
            </Label>
            <Select
              value={options.depth}
              onValueChange={(value) => update({ depth: value as AzureDevOpsReviewDepth })}
            >
              <SelectTrigger id="ado-review-depth" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="static">
                  {translate('azureDevOpsReview.depthStatic', 'Static review')}
                </SelectItem>
                <SelectItem value="build">
                  {translate('azureDevOpsReview.depthBuild', 'Build')}
                </SelectItem>
                <SelectItem value="build-and-test">
                  {translate('azureDevOpsReview.depthBuildAndTest', 'Build and run tests')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ado-review-surface">
              {translate('azureDevOpsReview.optionsSurface', 'Open in')}
            </Label>
            <Select
              value={options.surface}
              onValueChange={(value) => update({ surface: value as AzureDevOpsReviewSurface })}
            >
              <SelectTrigger id="ado-review-surface" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terminal">
                  {translate('azureDevOpsReview.surfaceTerminal', 'Terminal')}
                </SelectItem>
                <SelectItem value="chat">
                  {translate('azureDevOpsReview.surfaceChat', 'Structured chat')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ado-review-permissions">
              {translate('azureDevOpsReview.optionsPermissions', 'Permissions')}
            </Label>
            <Select
              value={options.permissions}
              disabled={options.surface === 'chat'}
              onValueChange={(value) =>
                update({ permissions: value as AzureDevOpsReviewPermissions })
              }
            >
              <SelectTrigger id="ado-review-permissions" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {translate('azureDevOpsReview.permissionsAuto', 'Auto (agent approves)')}
                </SelectItem>
                <SelectItem value="settings">
                  {translate('azureDevOpsReview.permissionsSettings', 'Agent Permissions setting')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {translate('azureDevOpsReview.optionsChecks', 'Additional checks')}
          </legend>
          {AZURE_DEVOPS_REVIEW_CHECKS.map((check) => {
            // Checks that execute code only apply once the review builds.
            const available = runsCode || check === 'security'
            const { title, hint } = checkLabel(check)
            return (
              <div key={check} className="flex items-start gap-2">
                <Checkbox
                  id={`ado-review-check-${check}`}
                  aria-describedby={`ado-review-check-${check}-hint`}
                  checked={available && options.checks.includes(check)}
                  disabled={!available}
                  onCheckedChange={(checked) => toggleCheck(check, checked === true)}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={`ado-review-check-${check}`}>{title}</Label>
                  <p
                    id={`ado-review-check-${check}-hint`}
                    className="text-xs text-muted-foreground"
                  >
                    {hint}
                  </p>
                </div>
              </div>
            )
          })}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="ado-review-instructions">
            {translate('azureDevOpsReview.optionsInstructions', 'Setup notes for the agent')}
          </Label>
          <Textarea
            id="ado-review-instructions"
            value={options.instructions}
            placeholder={translate(
              'azureDevOpsReview.optionsInstructionsPlaceholder',
              'For example: tests need Docker running; build with the Release configuration.'
            )}
            onChange={(event) => update({ instructions: event.target.value })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('azureDevOpsReview.optionsCancel', 'Cancel')}
          </Button>
          <Button onClick={() => onStart(normalizeAzureDevOpsReviewOptions(options))}>
            <Bot className="size-3.5" />
            {translate('azureDevOpsReview.optionsStart', 'Start review')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
