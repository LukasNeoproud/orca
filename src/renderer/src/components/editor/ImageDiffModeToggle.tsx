import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

/** Switches an image diff between both versions and the pixels that changed. */
export function ImageDiffModeToggle({
  showDifference,
  onChange
}: {
  showDifference: boolean
  onChange: (showDifference: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5" role="group">
      <Button
        variant={showDifference ? 'ghost' : 'secondary'}
        size="xs"
        aria-pressed={!showDifference}
        onClick={() => onChange(false)}
      >
        {translate('image.review.modeCompare', 'Both versions')}
      </Button>
      <Button
        variant={showDifference ? 'secondary' : 'ghost'}
        size="xs"
        aria-pressed={showDifference}
        onClick={() => onChange(true)}
      >
        {translate('image.review.modeDifference', 'Difference')}
      </Button>
    </div>
  )
}
