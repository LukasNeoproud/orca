import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { OrcaInteractionResult } from '../../../../shared/orca-interaction'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { OrcaInteractionForm } from '../native-chat/OrcaInteractionForm'
import {
  createOrcaInteractionDrafts,
  type OrcaInteractionDrafts
} from '../native-chat/orca-interaction-form-state'
import {
  useTerminalInteractionRequests,
  type RoutedTerminalInteractionRequest
} from './use-terminal-interaction-requests'

export function TerminalInteractionDialog(): React.JSX.Element | null {
  const { requests, respond } = useTerminalInteractionRequests()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const activeIndexRef = useRef(0)
  const [draftsByKey, setDraftsByKey] = useState<Record<string, OrcaInteractionDrafts>>({})
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)
  const submittingKeyRef = useRef<string | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const activeIndex = Math.max(
    0,
    requests.findIndex((request) => request.key === activeKey)
  )
  const active = requests[activeIndex] ?? null

  useEffect(() => {
    if (requests.length === 0) {
      setActiveKey(null)
      activeIndexRef.current = 0
      return
    }
    if (!activeKey || !requests.some((request) => request.key === activeKey)) {
      const nextIndex = Math.min(activeIndexRef.current, requests.length - 1)
      setActiveKey(requests[nextIndex]!.key)
    }
  }, [activeKey, requests])

  useEffect(() => {
    setResponseError(null)
  }, [active?.key])

  useEffect(() => {
    const liveKeys = new Set(requests.map((request) => request.key))
    setDraftsByKey((current) => {
      const staleKeys = Object.keys(current).filter((key) => !liveKeys.has(key))
      if (staleKeys.length === 0) {
        return current
      }
      const next = { ...current }
      for (const key of staleKeys) {
        delete next[key]
      }
      return next
    })
  }, [requests])

  const drafts = useMemo(
    () =>
      active ? (draftsByKey[active.key] ?? createOrcaInteractionDrafts(active.request)) : null,
    [active, draftsByKey]
  )

  if (!active || !drafts) {
    return null
  }

  const selectIndex = (index: number): void => {
    const next = requests[index]
    if (!next || submittingKeyRef.current) {
      return
    }
    activeIndexRef.current = index
    setActiveKey(next.key)
  }
  const handleResponse = async (
    request: RoutedTerminalInteractionRequest,
    result: OrcaInteractionResult
  ): Promise<void> => {
    if (submittingKeyRef.current) {
      return
    }
    submittingKeyRef.current = request.key
    setSubmittingKey(request.key)
    setResponseError(null)
    try {
      await respond(request, result)
    } catch (error) {
      setResponseError(
        error instanceof Error
          ? error.message
          : translate(
              'components.terminal-interaction.responseFailed',
              'The response could not be sent. Try again.'
            )
      )
    } finally {
      submittingKeyRef.current = null
      setSubmittingKey(null)
    }
  }
  const isSubmitting = submittingKey !== null

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          if (!isSubmitting) {
            void handleResponse(active, { status: 'cancelled' })
          }
        }}
      >
        <OrcaInteractionForm
          request={active.request}
          drafts={drafts}
          disabled={isSubmitting}
          focusKey={active.key}
          onDraftsChange={(nextDrafts) =>
            setDraftsByKey((current) => ({ ...current, [active.key]: nextDrafts }))
          }
          onRespond={(result) => void handleResponse(active, result)}
          footerMessage={responseError}
          fieldsClassName="border-t border-border"
          header={
            <DialogHeader className="gap-1 px-5 py-4 text-left">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-sm">
                    {active.request.title ??
                      translate('components.native-chat.interaction.title', 'Input requested')}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs">
                    {active.request.description ? (
                      <span className="block">{active.request.description}</span>
                    ) : null}
                    <span className={active.request.description ? 'mt-1 block' : 'block'}>
                      {translate(
                        'components.terminal-interaction.requestedByTerminal',
                        'Requested by {{terminal}}',
                        { terminal: active.terminalTitle ?? active.terminalHandle }
                      )}
                    </span>
                  </DialogDescription>
                </div>
                {requests.length > 1 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate(
                        'components.terminal-interaction.previous',
                        'Previous request'
                      )}
                      disabled={isSubmitting || activeIndex === 0}
                      onClick={() => selectIndex(activeIndex - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
                      {activeIndex + 1} / {requests.length}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={translate('components.terminal-interaction.next', 'Next request')}
                      disabled={isSubmitting || activeIndex === requests.length - 1}
                      onClick={() => selectIndex(activeIndex + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                ) : null}
              </div>
            </DialogHeader>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
