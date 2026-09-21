import { useTranslation } from 'react-i18next'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  nativeChatTokensPerSecond,
  type NativeChatGeneration
} from '../../../../shared/native-chat-generation'

export function NativeChatGenerationStats({
  generation
}: {
  generation?: NativeChatGeneration
}): React.JSX.Element | null {
  useTranslation()
  if (!generation) {
    return null
  }

  const rate = nativeChatTokensPerSecond(generation)
  const format = new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 1 })
  const mode =
    generation.serviceTier === 'priority'
      ? translate('components.native-chat.generation.fast', 'Fast mode')
      : generation.serviceTier === 'default'
        ? translate('components.native-chat.generation.standard', 'Standard mode')
        : generation.serviceTier
          ? translate('components.native-chat.generation.tierMode', '{{tier}} mode', {
              tier: generation.serviceTier
            })
          : translate('components.native-chat.generation.unknownMode', 'Mode unavailable')
  const label = [
    generation.model ||
      translate('components.native-chat.generation.unknownModel', 'Model unavailable'),
    mode,
    rate === null
      ? translate('components.native-chat.generation.unavailable', 'tok/s unavailable')
      : `≈ ${format.format(rate)} tok/s`
  ]
    .filter(Boolean)
    .join(' · ')
  const description =
    rate === null
      ? translate(
          'components.native-chat.generation.unavailableDetail',
          'Token count or generation time is unavailable.'
        )
      : translate(
          'components.native-chat.generation.estimateDetail',
          '{{tokens}} output tokens (excluding reasoning) ÷ {{seconds}} s',
          {
            tokens: format.format(generation.outputTokens!),
            seconds: new Intl.NumberFormat(getIntlLocale(), {
              maximumSignificantDigits: 3
            }).format(generation.generationDurationMs! / 1_000)
          }
        )

  return (
    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${label}. ${description}`}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">{description}</TooltipContent>
      </Tooltip>
    </div>
  )
}
