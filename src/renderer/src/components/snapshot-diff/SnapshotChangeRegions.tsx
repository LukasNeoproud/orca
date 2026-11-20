import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SnapshotChangeRegion } from './snapshot-change-regions'
import { snapshotRegionFrame } from './snapshot-region-frame'

type ImageSize = { width: number; height: number }

/** Numbered outlines of the changed areas, drawn over the difference image. */
export function SnapshotChangeRegionOverlay({
  regions,
  image,
  activeIndex
}: {
  regions: readonly SnapshotChangeRegion[]
  image: ImageSize
  activeIndex: number | null
}): JSX.Element {
  return (
    <>
      {regions.map((region, index) => {
        const frame = snapshotRegionFrame(region, image)
        return (
          <div
            key={index}
            aria-hidden="true"
            data-snapshot-region={index + 1}
            data-current={index === activeIndex ? 'true' : undefined}
            // Why neutral: red and green mark removed and added pixels inside the outline.
            className={cn(
              'pointer-events-none absolute',
              index === activeIndex
                ? 'border-2 border-ring bg-ring/20'
                : 'border border-foreground/60'
            )}
            style={{
              left: `${frame.x}%`,
              top: `${frame.y}%`,
              width: `${frame.width}%`,
              height: `${frame.height}%`
            }}
          >
            <span className="absolute -left-px -top-px rounded-br-sm bg-foreground px-1 text-3xs font-semibold leading-4 tabular-nums text-background">
              {index + 1}
            </span>
          </div>
        )
      })}
    </>
  )
}

/** The changed areas as a list; choosing one scrolls the images to it. */
export function SnapshotChangeRegionList({
  regions,
  activeIndex,
  onSelect
}: {
  regions: readonly SnapshotChangeRegion[]
  activeIndex: number | null
  onSelect: (index: number) => void
}): JSX.Element {
  return (
    <div className="flex max-h-24 shrink-0 flex-wrap items-center gap-1 overflow-y-auto border-t border-border px-3 py-1.5 scrollbar-sleek">
      <span className="mr-1 text-xs text-muted-foreground">
        {translate('snapshotDiff.areasTitle', 'Change areas')}
      </span>
      {regions.map((region, index) => (
        <Button
          key={index}
          variant={index === activeIndex ? 'secondary' : 'ghost'}
          size="xs"
          aria-pressed={index === activeIndex}
          aria-label={translate('snapshotDiff.goToArea', 'Go to change area {{value0}}', {
            value0: index + 1
          })}
          onClick={() => onSelect(index)}
        >
          <span className="font-semibold tabular-nums">{index + 1}</span>
          <span className="tabular-nums text-muted-foreground">
            {translate('snapshotDiff.areaSize', '{{width}} × {{height}} px', {
              width: region.width,
              height: region.height
            })}
          </span>
        </Button>
      ))}
    </div>
  )
}
