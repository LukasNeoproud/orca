import { useId } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'
import { qualityGateDraftErrorLabel } from './quality-gate-labels'
import type { QualityGateDraft, QualityGateDraftErrors } from './quality-gate-settings-draft'

type QualityGateDraftEditorProps = {
  draft: QualityGateDraft
  errors: QualityGateDraftErrors
  /** Errors stay quiet until the first attempt to save. */
  showErrors: boolean
  saving: boolean
  onChange: (draft: QualityGateDraft) => void
  onSave: () => void
  onCancel: () => void
}

function FieldError({ id, text }: { id: string; text: string | null }): React.JSX.Element | null {
  return text ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {text}
    </p>
  ) : null
}

export function QualityGateDraftEditor({
  draft,
  errors,
  showErrors,
  saving,
  onChange,
  onSave,
  onCancel
}: QualityGateDraftEditorProps): React.JSX.Element {
  const id = useId()
  const shown = showErrors ? errors : {}
  const nameError = qualityGateDraftErrorLabel('name', shown)
  const commandError = qualityGateDraftErrorLabel('command', shown)
  const timeoutError = qualityGateDraftErrorLabel('timeoutSeconds', shown)

  return (
    <form
      className="space-y-4 rounded-xl border border-border/50 bg-background/70 p-4 shadow-sm"
      data-quality-gate-editor={draft.id ?? 'new'}
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>{translate('qualityGates.nameLabel', 'Name')}</Label>
        <Input
          id={`${id}-name`}
          autoFocus
          value={draft.name}
          placeholder={translate('qualityGates.namePlaceholder', 'Lint')}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
        <FieldError id={`${id}-name-error`} text={nameError} />
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-command`}>
            {translate('qualityGates.commandLabel', 'Command')}
          </Label>
          <p id={`${id}-command-help`} className="text-xs text-muted-foreground">
            {translate(
              'qualityGates.commandHelp',
              'Runs in a shell at the workspace root, on the host that owns the workspace. Exit code 0 passes.'
            )}
          </p>
        </div>
        <Textarea
          id={`${id}-command`}
          variant="code"
          rows={2}
          spellCheck={false}
          value={draft.command}
          placeholder="pnpm lint"
          aria-invalid={commandError ? true : undefined}
          aria-describedby={
            commandError ? `${id}-command-error ${id}-command-help` : `${id}-command-help`
          }
          onChange={(event) => onChange({ ...draft, command: event.target.value })}
        />
        <FieldError id={`${id}-command-error`} text={commandError} />
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-timeout`}>
            {translate('qualityGates.timeoutLabel', 'Time limit (seconds)')}
          </Label>
          <p id={`${id}-timeout-help`} className="text-xs text-muted-foreground">
            {translate(
              'qualityGates.timeoutHelp',
              'The command is stopped when it runs longer than this.'
            )}
          </p>
        </div>
        <div className="w-32">
          <Input
            id={`${id}-timeout`}
            inputMode="numeric"
            value={draft.timeoutSeconds}
            aria-invalid={timeoutError ? true : undefined}
            aria-describedby={
              timeoutError ? `${id}-timeout-error ${id}-timeout-help` : `${id}-timeout-help`
            }
            onChange={(event) => onChange({ ...draft, timeoutSeconds: event.target.value })}
          />
        </div>
        <FieldError id={`${id}-timeout-error`} text={timeoutError} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-required`}>{translate('qualityGates.required', 'Required')}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'qualityGates.requiredHelp',
              '`orca gates run` exits with an error unless every required gate passed. An optional gate is only reported.'
            )}
          </p>
        </div>
        <Switch
          id={`${id}-required`}
          checked={draft.required}
          onCheckedChange={(required) => onChange({ ...draft, required })}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {translate('qualityGates.cancel', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {translate('qualityGates.save', 'Save')}
        </Button>
      </div>
    </form>
  )
}
