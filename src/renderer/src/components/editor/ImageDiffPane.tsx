import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { buildImageDataUri } from '../../../../shared/image-data-uri'
import type { ImageReviewRegion } from '../../../../shared/diff-comment-types'
import { getZoomedImageLayoutSize, type ImageViewerSurfaceSize } from './image-viewer-zoom'
import {
  applyAnchoredImageViewerZoomChange,
  applyImageSurfaceWheel,
  getImageLayoutStyle
} from './image-viewer-dom-zoom'
import ImageViewerPopup from './ImageViewerPopup'
import {
  imageReviewRegionBetween,
  pointOnImage,
  type ImageReviewPoint
} from './image-review-region'

// Why: tall screenshots at full width dwarf the diff list; 2rem below the pane's 32rem cap.
const INTRINSIC_MAX_IMAGE_HEIGHT_PX = 480

type Props = {
  label: string
  content: string
  filePath: string
  mimeType: string
  zoom: number
  layout: 'fill' | 'intrinsic'
  annotating: boolean
  region: ImageReviewRegion | null
  savedRegions: readonly ImageReviewRegion[]
  onRegion: (region: ImageReviewRegion) => void
  onScroll: (surface: HTMLDivElement) => void
  onSurface: (surface: HTMLDivElement | null) => void
}

export function ImageDiffPane({
  label,
  content,
  filePath,
  mimeType,
  zoom,
  layout,
  annotating,
  region,
  savedRegions,
  onRegion,
  onScroll,
  onSurface
}: Props): JSX.Element {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<ImageReviewPoint | null>(null)
  const [dragEnd, setDragEnd] = useState<ImageReviewPoint | null>(null)
  const [surfaceSize, setSurfaceSize] = useState<{ width: number; height: number } | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupZoom, setPopupZoom] = useState(1)
  const [popupSize, setPopupSize] = useState<ImageViewerSurfaceSize | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const source = useMemo(
    () => buildImageDataUri(mimeType, content.replace(/\s/g, '')),
    [content, mimeType]
  )
  const intrinsic = layout === 'intrinsic'

  const changePopupZoom = useCallback(
    (getNext: (current: number) => number, anchor?: { x: number; y: number } | null) => {
      applyAnchoredImageViewerZoomChange(popupRef.current, setPopupZoom, getNext, anchor)
    },
    []
  )
  const onPopupWheel = useCallback(
    (event: WheelEvent): void => {
      applyImageSurfaceWheel(event, changePopupZoom)
    },
    [changePopupZoom]
  )
  const setPopupSurface = useCallback((surface: HTMLDivElement | null): void => {
    popupRef.current = surface
  }, [])

  useEffect(() => {
    const surface = popupRef.current
    if (!popupOpen || !surface) {
      return
    }
    surface.addEventListener('wheel', onPopupWheel, { passive: false })
    const update = (): void =>
      setPopupSize({ width: surface.clientWidth, height: surface.clientHeight })
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(surface)
    return () => {
      surface.removeEventListener('wheel', onPopupWheel)
      observer?.disconnect()
    }
  }, [popupOpen, onPopupWheel])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    const update = (): void =>
      setSurfaceSize({ width: surface.clientWidth, height: surface.clientHeight })
    update()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(update)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [content])

  const intrinsicScale =
    intrinsic && imageSize && surfaceSize
      ? Math.min(
          1,
          Math.max(0, surfaceSize.width - 32) / imageSize.width,
          INTRINSIC_MAX_IMAGE_HEIGHT_PX / imageSize.height
        )
      : null
  const size =
    intrinsicScale !== null && imageSize
      ? {
          width: imageSize.width * intrinsicScale * zoom,
          height: imageSize.height * intrinsicScale * zoom
        }
      : getZoomedImageLayoutSize({ imageDimensions: imageSize, surfaceSize, zoom })
  const popupLayoutSize = getZoomedImageLayoutSize({
    imageDimensions: imageSize,
    surfaceSize: popupSize,
    zoom: popupZoom
  })
  const activeRegion =
    startRef.current && dragEnd ? imageReviewRegionBetween(startRef.current, dragEnd) : region
  const filename = filePath.split(/[/\\]/).pop() || filePath
  const handlePointerDown = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (!annotating || event.button !== 0) {
      return
    }
    event.preventDefault()
    startRef.current = pointOnImage(event.nativeEvent, event.currentTarget)
    setDragEnd(startRef.current)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (!startRef.current) {
      return
    }
    setDragEnd(pointOnImage(event.nativeEvent, event.currentTarget))
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLImageElement>): void => {
    if (!startRef.current) {
      return
    }
    const next = imageReviewRegionBetween(
      startRef.current,
      pointOnImage(event.nativeEvent, event.currentTarget)
    )
    startRef.current = null
    setDragEnd(null)
    if (next) {
      onRegion(next)
    }
  }

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-md bg-muted/10',
        intrinsic ? 'h-auto' : 'h-full'
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-1 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {source && !failed && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setPopupZoom(zoom)
              setPopupOpen(true)
            }}
            aria-label={`${translate('auto.components.editor.ImageViewer.77bfc9b35a', 'Open image in popup')}: ${label}`}
          >
            {translate('image.review.openLarge', 'Open larger')}
          </Button>
        )}
      </div>
      {!content ? (
        <div
          className={cn(
            'flex items-center justify-center bg-muted/20 p-6 text-sm text-muted-foreground',
            intrinsic ? 'min-h-32' : 'flex-1'
          )}
        >
          {translate('auto.components.editor.ImageDiffViewer.fb0ae4f3c0', 'No preview')}
        </div>
      ) : !source || failed ? (
        <div className="flex min-h-32 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.editor.ImageViewer.d9d2944855',
            'Failed to load file preview'
          )}
        </div>
      ) : (
        <div
          ref={(element) => {
            surfaceRef.current = element
            onSurface(element)
          }}
          className={cn(
            'scrollbar-editor overflow-auto bg-muted/20',
            // Why the cap: a zoomed image scrolls inside the pane instead of stretching the list.
            intrinsic ? 'max-h-[32rem] min-h-32' : 'min-h-0 flex-1'
          )}
          onScroll={(event) => onScroll(event.currentTarget)}
        >
          <div
            className={cn(
              'flex h-max min-h-full w-max min-w-full items-center justify-center p-4',
              intrinsic && 'min-h-32'
            )}
          >
            <div
              className="relative shrink-0"
              style={
                size
                  ? { width: size.width, height: size.height }
                  : { transform: `scale(${zoom})`, transformOrigin: 'top left' }
              }
            >
              <img
                src={source}
                alt={filename}
                draggable={false}
                className={cn(
                  'block select-none object-contain',
                  annotating && 'cursor-crosshair',
                  size ? 'h-full w-full' : 'max-h-[100vh] max-w-[100vw]'
                )}
                onLoad={(event) =>
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight
                  })
                }
                onError={() => setFailed(true)}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  startRef.current = null
                  setDragEnd(null)
                }}
              />
              {savedRegions.map((saved, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="pointer-events-none absolute border border-ring bg-ring/10"
                  style={{
                    left: `${saved.x}%`,
                    top: `${saved.y}%`,
                    width: `${saved.width}%`,
                    height: `${saved.height}%`
                  }}
                />
              ))}
              {activeRegion && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-ring bg-ring/20"
                  style={{
                    left: `${activeRegion.x}%`,
                    top: `${activeRegion.y}%`,
                    width: `${activeRegion.width}%`,
                    height: `${activeRegion.height}%`
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {source && (
        <ImageViewerPopup
          filename={filename}
          isOpen={popupOpen}
          previewUrl={source}
          zoomPercent={Math.round(popupZoom * 100)}
          imageLayoutSize={popupLayoutSize}
          imageLayoutStyle={getImageLayoutStyle(popupLayoutSize)}
          onOpenChange={setPopupOpen}
          setSurfaceRef={setPopupSurface}
        />
      )}
    </section>
  )
}
