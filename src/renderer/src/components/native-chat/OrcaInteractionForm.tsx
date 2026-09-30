import { useEffect, useRef } from 'react'
import type {
  OrcaInteractionRequest,
  OrcaInteractionResult
} from '../../../../shared/orca-interaction'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { InteractionFieldControl, type FieldDraft } from './NativeChatInteractionFieldControl'
import {
  resolveOrcaInteractionDrafts,
  type OrcaInteractionDrafts
} from './orca-interaction-form-state'

export function OrcaInteractionForm({
  request,
  drafts,
  disabled = false,
  focusKey,
  header,
  className,
  fieldsClassName,
  footerClassName,
  footerMessage,
  onDraftsChange,
  onRespond
}: {
  request: OrcaInteractionRequest
  drafts: OrcaInteractionDrafts
  disabled?: boolean
  focusKey?: string
  header: React.ReactNode
  className?: string
  fieldsClassName?: string
  footerClassName?: string
  footerMessage?: React.ReactNode
  onDraftsChange: (drafts: OrcaInteractionDrafts) => void
  onRespond: (result: OrcaInteractionResult) => void
}): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null)
  const resolved = resolveOrcaInteractionDrafts(request, drafts)

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[data-interaction-control]')?.focus()
  }, [focusKey])

  const update = (id: string, draft: FieldDraft): void => {
    onDraftsChange({ ...drafts, [id]: draft })
  }
  const cancel = (): void => {
    if (!disabled) {
      onRespond({ status: 'cancelled' })
    }
  }
  const submit = (): void => {
    if (!disabled && resolved.canSubmit) {
      onRespond(resolved.result)
    }
  }

  return (
    <form
      ref={formRef}
      className={cn('overflow-hidden', className)}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          cancel()
        } else if (
          event.key === 'Enter' &&
          event.target instanceof HTMLElement &&
          event.target.tagName !== 'TEXTAREA' &&
          event.target.tagName !== 'BUTTON'
        ) {
          event.preventDefault()
          submit()
        }
      }}
      noValidate
    >
      <fieldset className="contents" disabled={disabled}>
        {header}
        <div
          className={cn(
            'max-h-[50vh] space-y-4 overflow-y-auto px-3.5 py-3 scrollbar-sleek',
            fieldsClassName
          )}
        >
          {request.fields.map((field, index) => (
            <InteractionFieldControl
              key={field.id}
              field={field}
              draft={drafts[field.id]!}
              autofocus={index === 0}
              error={resolved.errors[field.id]}
              onChange={(draft) => update(field.id, draft)}
            />
          ))}
        </div>
        <div
          className={cn(
            'flex justify-end gap-2 border-t border-border px-3.5 py-2.5',
            footerClassName
          )}
        >
          {resolved.formError || footerMessage ? (
            <p className="mr-auto self-center text-xs text-destructive" role="alert">
              {resolved.formError ?? footerMessage}
            </p>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>
            {translate('components.native-chat.interaction.cancel', 'Cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={!resolved.canSubmit || disabled}>
            {request.submitLabel ??
              translate('components.native-chat.interaction.submit', 'Submit')}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
