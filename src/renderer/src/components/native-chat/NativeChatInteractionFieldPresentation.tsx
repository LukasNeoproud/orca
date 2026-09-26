import type { OrcaInteractionField } from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'

export function InteractionFieldHeader({
  field
}: {
  field: OrcaInteractionField
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-foreground">
        {field.label}
        {field.required ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {translate('components.native-chat.interaction.required', '(required)')}
          </span>
        ) : null}
      </div>
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  )
}

export function InteractionValidationMessage({
  id,
  error
}: {
  id: string
  error?: string
}): React.JSX.Element | null {
  return error ? (
    <p id={id} className="text-xs text-destructive" role="alert">
      {error}
    </p>
  ) : null
}
