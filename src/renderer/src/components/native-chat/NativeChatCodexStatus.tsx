import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type { CodexContextUsage } from '../../../../shared/codex-context-usage'

type NativeChatCodexStatusProps = {
  contextUsage?: CodexContextUsage | null
  weeklyUsedPercent?: number | null
}

const RING_SIZE = 20
const RING_CENTER = RING_SIZE / 2
const RING_RADIUS = 7
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function isFiniteNonNegative(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
}

function formatTokens(value: number | undefined): string {
  if (!isFiniteNonNegative(value)) {
    return '—'
  }
  const thousands = value / 1_000
  return `${Number(thousands.toFixed(1))}K`
}

function formatPercent(value: number): string {
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`
}

function contextState(contextUsage: CodexContextUsage | null | undefined): {
  known: boolean
  used: number | undefined
  max: number | undefined
  ratio: number
  thresholdRatio: number | null
} {
  const used = contextUsage?.usedTokens
  const max = contextUsage?.maxTokens
  const hasMax = isFiniteNonNegative(max) && max > 0
  const known = !contextUsage?.stale && isFiniteNonNegative(used) && hasMax
  const canShowThreshold =
    hasMax &&
    !contextUsage?.stale &&
    contextUsage?.compactScope !== 'body_after_prefix' &&
    isFiniteNonNegative(contextUsage?.autoCompactThresholdTokens)

  return {
    known,
    used,
    max,
    ratio: known ? Math.min(used! / max!, 1) : 0,
    thresholdRatio: canShowThreshold
      ? Math.min(contextUsage.autoCompactThresholdTokens! / max!, 1)
      : null
  }
}

export function NativeChatCodexStatus({
  contextUsage,
  weeklyUsedPercent
}: NativeChatCodexStatusProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const context = contextState(contextUsage)
  const weeklyKnown = isFiniteNonNegative(weeklyUsedPercent)
  const weeklyRemaining = weeklyKnown
    ? Math.round(Math.min(Math.max(100 - weeklyUsedPercent, 0), 100))
    : null

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) {
      clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
  }, [])

  const closeTransient = useCallback(() => {
    cancelHoverClose()
    if (!pinned) {
      hoverCloseTimer.current = setTimeout(() => setOpen(false), 100)
    }
  }, [cancelHoverClose, pinned])

  useEffect(() => () => cancelHoverClose(), [cancelHoverClose])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setPinned(false)
    }
  }, [])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      cancelHoverClose()
      const nextPinned = !pinned
      setPinned(nextPinned)
      setOpen(nextPinned)
    },
    [cancelHoverClose, pinned]
  )

  const usedLabel = formatTokens(context.used)
  const maxLabel = formatTokens(context.max)
  const compactLimit = formatTokens(contextUsage?.autoCompactThresholdTokens)
  const compactSource =
    contextUsage?.thresholdSource === 'config'
      ? translate('components.native-chat.codexStatus.configured', 'configured')
      : translate('components.native-chat.codexStatus.modelDefault', 'model default')
  const compactEstimated = contextUsage?.thresholdEstimated
    ? ` ${translate('components.native-chat.codexStatus.estimated', 'estimated')}`
    : ''

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate(
              'components.native-chat.codexStatus.trigger',
              'Codex context usage'
            )}
            aria-expanded={open}
            className="relative pointer-coarse:size-11"
            onMouseEnter={() => {
              cancelHoverClose()
              setOpen(true)
            }}
            onMouseLeave={closeTransient}
            onFocus={() => {
              cancelHoverClose()
              setOpen(true)
            }}
            onBlur={closeTransient}
            onClick={handleClick}
            data-context-known={context.known || undefined}
          >
            <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
              <circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-25"
              />
              {context.known && context.ratio > 0 ? (
                <circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="butt"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - context.ratio)}
                  data-context-fill-ratio={context.ratio}
                />
              ) : null}
              {context.thresholdRatio !== null && context.thresholdRatio < 1 ? (
                <circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--destructive)"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray={`${(1 - context.thresholdRatio) * 100} ${context.thresholdRatio * 100}`}
                  strokeDashoffset={-context.thresholdRatio * 100}
                  className="opacity-75"
                  data-context-threshold-ratio={context.thresholdRatio}
                />
              ) : null}
            </svg>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          sideOffset={6}
          className="w-64 p-3"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={closeTransient}
        >
          <div className="space-y-2 text-xs tabular-nums text-muted-foreground">
            <div className="flex items-baseline justify-between text-popover-foreground">
              <span className="font-medium">
                {translate('components.native-chat.codexStatus.title', 'Context')}
              </span>
              <span className="text-lg font-semibold">
                {context.known ? formatPercent(context.ratio) : '—'}
              </span>
            </div>
            <div className="border-b border-border pb-2">
              {translate(
                'components.native-chat.codexStatus.tokenUsage',
                '{{used}} / {{max}} tokens',
                {
                  used: usedLabel,
                  max: maxLabel
                }
              )}
            </div>
            {contextUsage?.stale ? (
              <div>
                {translate(
                  'components.native-chat.codexStatus.stale',
                  'Context usage may be stale'
                )}
              </div>
            ) : contextUsage?.compactScope === 'body_after_prefix' ? (
              <div>
                {translate(
                  'components.native-chat.codexStatus.afterPrefix',
                  'Compaction growth limit: {{tokens}} after prefix ({{source}}){{estimated}}',
                  { tokens: compactLimit, source: compactSource, estimated: compactEstimated }
                )}
              </div>
            ) : isFiniteNonNegative(contextUsage?.autoCompactThresholdTokens) ? (
              <>
                {isFiniteNonNegative(contextUsage?.usedTokens) ? (
                  <div className="font-medium text-popover-foreground">
                    {translate(
                      'components.native-chat.codexStatus.untilCompaction',
                      '{{tokens}} tokens until compaction',
                      {
                        tokens: formatTokens(
                          Math.max(
                            contextUsage.autoCompactThresholdTokens - contextUsage.usedTokens,
                            0
                          )
                        )
                      }
                    )}
                  </div>
                ) : null}
                <div>
                  {translate(
                    'components.native-chat.codexStatus.compactsAt',
                    'Compacts at {{tokens}} ({{source}}){{estimated}}',
                    { tokens: compactLimit, source: compactSource, estimated: compactEstimated }
                  )}
                </div>
              </>
            ) : (
              <div>
                {translate(
                  'components.native-chat.codexStatus.thresholdUnavailable',
                  'Compaction threshold unavailable'
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <span>
        {weeklyRemaining === null
          ? translate('components.native-chat.codexStatus.weeklyUnknown', 'weekly —')
          : translate('components.native-chat.codexStatus.weeklyLeft', 'weekly {{percent}}% left', {
              percent: weeklyRemaining
            })}
      </span>
    </div>
  )
}

export { formatTokens }
