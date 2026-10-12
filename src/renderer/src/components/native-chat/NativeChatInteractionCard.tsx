import { useState } from 'react'
import { X } from 'lucide-react'
import {
  encodeOrcaInteractionResult,
  OrcaInteractionRequestSchema,
  type OrcaInteractionRequest
} from '../../../../shared/orca-interaction'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { OrcaInteractionForm } from './OrcaInteractionForm'
import { createOrcaInteractionDrafts } from './orca-interaction-form-state'

export function readQuestionInteraction(value: unknown): OrcaInteractionRequest | null {
  if (!value) {
    return null
  }
  const parsed = OrcaInteractionRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function NativeChatInteractionCard({
  request,
  onRespond
}: {
  request: OrcaInteractionRequest
  onRespond: (answer: string) => void
}): React.JSX.Element {
  const [drafts, setDrafts] = useState(() => createOrcaInteractionDrafts(request))

  return (
    <div className="shrink-0 bg-background">
      <div className="mx-auto w-full max-w-4xl px-3 pt-2 pb-4 sm:px-4">
        <OrcaInteractionForm
          request={request}
          drafts={drafts}
          onDraftsChange={setDrafts}
          onRespond={(result) => onRespond(encodeOrcaInteractionResult(result))}
          className="overflow-hidden rounded-lg border border-input bg-card shadow-xs"
          fieldsClassName="border-t border-border"
          header={
            <div className="flex items-start justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold text-foreground">
                  {request.title ??
                    translate('components.native-chat.interaction.title', 'Input requested')}
                </h3>
                {request.description ? (
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {request.description}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRespond(encodeOrcaInteractionResult({ status: 'cancelled' }))}
                aria-label={translate('components.native-chat.interaction.cancel', 'Cancel')}
              >
                <X />
              </Button>
            </div>
          }
        />
      </div>
    </div>
  )
}
