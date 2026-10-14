import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { flushSync } from 'react-dom'
import { MessageSquarePlus, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectWorktreeDiffComments } from '@/store/worktree-diff-comments-selector'
import { Button } from '@/components/ui/button'
import type { DiffComment, ImageReviewRegion } from '../../../../shared/diff-comment-types'
import {
  getAnchoredImageViewerScrollOffset,
  IMAGE_VIEWER_ZOOM_STEP,
  MAX_IMAGE_VIEWER_ZOOM,
  MIN_IMAGE_VIEWER_ZOOM,
  getNextWheelImageViewerZoom
} from './image-viewer-zoom'
import { isImageReviewRegion } from './image-review-region'
import { ImageDiffPane } from './ImageDiffPane'
import { PdfDiffViewer } from './PdfDiffViewer'
import { ImageDiffNotesPanel } from './ImageDiffNotesPanel'
import { ImageDiffModeToggle } from './ImageDiffModeToggle'
import { ImageDifferencePane } from './ImageDifferencePane'
import { getDiffContentSignature } from './diff-content-signature'

type ImageDiffViewerProps = {
  originalContent: string
  modifiedContent: string
  filePath: string
  mimeType?: string
  sideBySide: boolean
  layout?: 'fill' | 'intrinsic'
  worktreeId?: string
}

export default function ImageDiffViewer(props: ImageDiffViewerProps): JSX.Element {
  const key = `${props.filePath}:${props.mimeType}:${getDiffContentSignature(props.originalContent)}:${getDiffContentSignature(props.modifiedContent)}`
  return <ImageDiffViewerContent key={key} {...props} />
}

function ImageDiffViewerContent({
  originalContent,
  modifiedContent,
  filePath,
  mimeType = 'image/png',
  sideBySide,
  layout = 'fill',
  worktreeId
}: ImageDiffViewerProps): JSX.Element {
  const [zoom, setZoom] = useState(1)
  const [showDifference, setShowDifference] = useState(false)
  // Why both sides: a difference needs an image on each side of the change.
  const canCompare = Boolean(originalContent && modifiedContent)
  const [annotating, setAnnotating] = useState(false)
  const [region, setRegion] = useState<ImageReviewRegion | null>(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const surfacesRef = useRef<(HTMLDivElement | null)[]>([null, null])
  const addDiffComment = useAppStore((s) => s.addDiffComment)
  const scrollToDiffCommentId = useAppStore((s) => s.scrollToDiffCommentId)
  const setScrollToDiffCommentId = useAppStore((s) => s.setScrollToDiffCommentId)
  const allComments = useAppStore((s): DiffComment[] | undefined =>
    selectWorktreeDiffComments(s, worktreeId)
  )
  const comments = useMemo(
    () =>
      (allComments ?? []).filter(
        (comment) =>
          comment.filePath === filePath && comment.source === 'image' && comment.imageRegion
      ),
    [allComments, filePath]
  )
  const isPdf = mimeType === 'application/pdf'

  useEffect(() => {
    if (
      !scrollToDiffCommentId ||
      !comments.some((comment) => comment.id === scrollToDiffCommentId)
    ) {
      return
    }
    const note = document.getElementById(`image-review-note-${scrollToDiffCommentId}`)
    note?.scrollIntoView({ block: 'nearest' })
    setScrollToDiffCommentId(null)
  }, [comments, scrollToDiffCommentId, setScrollToDiffCommentId])

  const syncScroll = (source: HTMLDivElement): void => {
    const other = surfacesRef.current.find((surface) => surface && surface !== source)
    if (!other) {
      return
    }
    const horizontal = source.scrollWidth - source.clientWidth
    const vertical = source.scrollHeight - source.clientHeight
    const nextLeft =
      horizontal > 0
        ? (source.scrollLeft / horizontal) * (other.scrollWidth - other.clientWidth)
        : 0
    const nextTop =
      vertical > 0 ? (source.scrollTop / vertical) * (other.scrollHeight - other.clientHeight) : 0
    if (Math.abs(other.scrollLeft - nextLeft) > 1) {
      other.scrollLeft = nextLeft
    }
    if (Math.abs(other.scrollTop - nextTop) > 1) {
      other.scrollTop = nextTop
    }
  }

  const changeZoom = (
    getNext: (current: number) => number,
    source?: HTMLDivElement,
    anchor?: { x: number; y: number }
  ): void => {
    const oldZoom = zoom
    const nextZoom = Math.min(
      MAX_IMAGE_VIEWER_ZOOM,
      Math.max(MIN_IMAGE_VIEWER_ZOOM, getNext(oldZoom))
    )
    if (nextZoom === oldZoom) {
      return
    }
    const target = source ?? surfacesRef.current[1] ?? surfacesRef.current[0]
    const point = anchor ?? {
      x: (target?.clientWidth ?? 0) / 2,
      y: (target?.clientHeight ?? 0) / 2
    }
    const left = target?.scrollLeft ?? 0
    const top = target?.scrollTop ?? 0
    flushSync(() => setZoom(nextZoom))
    if (target) {
      target.scrollLeft = getAnchoredImageViewerScrollOffset({
        scrollOffset: left,
        anchorOffset: point.x,
        currentZoom: oldZoom,
        nextZoom
      })
      target.scrollTop = getAnchoredImageViewerScrollOffset({
        scrollOffset: top,
        anchorOffset: point.y,
        currentZoom: oldZoom,
        nextZoom
      })
      syncScroll(target)
    }
  }

  useEffect(() => {
    const originalSurface = surfacesRef.current[0]
    const modifiedSurface = surfacesRef.current[1]
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || !(event.currentTarget instanceof HTMLDivElement)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const surface = event.currentTarget
      const bounds = surface.getBoundingClientRect()
      changeZoom(
        (current) => getNextWheelImageViewerZoom(current, event.deltaY, event.deltaMode),
        surface,
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      )
    }
    originalSurface?.addEventListener('wheel', wheel, { passive: false })
    modifiedSurface?.addEventListener('wheel', wheel, { passive: false })
    return () => {
      originalSurface?.removeEventListener('wheel', wheel)
      modifiedSurface?.removeEventListener('wheel', wheel)
    }
  })

  const saveNote = async (): Promise<void> => {
    if (!worktreeId || !region || !isImageReviewRegion(region) || !body.trim() || submitting) {
      return
    }
    setSubmitting(true)
    setError(false)
    try {
      const saved = await addDiffComment({
        worktreeId,
        filePath,
        source: 'image',
        imageRegion: region,
        lineNumber: 0,
        body: body.trim(),
        side: 'modified'
      })
      if (saved) {
        setBody('')
        setRegion(null)
        setAnnotating(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const gridRowStyle =
    !sideBySide && layout === 'fill'
      ? {
          gridTemplateRows: `${originalContent ? 'minmax(32rem, 1fr)' : 'auto'} ${modifiedContent ? 'minmax(32rem, 1fr)' : 'auto'}`
        }
      : undefined

  if (isPdf) {
    return (
      <PdfDiffViewer
        originalContent={originalContent}
        modifiedContent={modifiedContent}
        filePath={filePath}
        sideBySide={sideBySide}
        layout={layout}
      />
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col', layout === 'intrinsic' ? 'h-auto' : 'h-full')}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom((current) => current / IMAGE_VIEWER_ZOOM_STEP)}
          disabled={zoom <= MIN_IMAGE_VIEWER_ZOOM}
          aria-label={translate('auto.components.editor.ImageViewer.be27304574', 'Zoom out')}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom(() => 1)}
          disabled={zoom === 1}
          aria-label={translate('auto.components.editor.ImageViewer.6c89c73d9f', 'Reset zoom')}
        >
          <RotateCcw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => changeZoom((current) => current * IMAGE_VIEWER_ZOOM_STEP)}
          disabled={zoom >= MAX_IMAGE_VIEWER_ZOOM}
          aria-label={translate('auto.components.editor.ImageViewer.3c9217f5a6', 'Zoom in')}
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <span className="w-10 tabular-nums">{Math.round(zoom * 100)}%</span>
        {canCompare && (
          <ImageDiffModeToggle showDifference={showDifference} onChange={setShowDifference} />
        )}
        {worktreeId && modifiedContent && (
          <Button
            variant={annotating ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setAnnotating((current) => !current)}
            aria-pressed={annotating}
          >
            <MessageSquarePlus className="size-3.5" />
            {translate('image.review.annotate', 'Select area')}
          </Button>
        )}
        {worktreeId && modifiedContent && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setRegion({ x: 0, y: 0, width: 100, height: 100 })
              setAnnotating(false)
            }}
          >
            {translate('image.review.keyboardArea', 'Enter area coordinates')}
          </Button>
        )}
        <span className="ml-auto">
          {translate('image.review.zoomHint', 'Ctrl + scroll to zoom; scroll to pan both images')}
        </span>
      </div>
      {canCompare && showDifference ? (
        <div
          className={cn('min-h-0 p-3', layout === 'intrinsic' ? 'h-auto' : 'flex flex-1 flex-col')}
        >
          <ImageDifferencePane
            originalContent={originalContent}
            modifiedContent={modifiedContent}
            filePath={filePath}
            mimeType={mimeType}
            zoom={zoom}
            layout={layout}
            onSurface={(surface) => {
              surfacesRef.current[1] = surface
            }}
          />
        </div>
      ) : (
        <div
          className={cn(
            'grid min-h-0 gap-3 p-3',
            layout === 'intrinsic' ? 'h-auto' : 'flex-1',
            sideBySide ? 'grid-cols-2' : 'grid-cols-1',
            !sideBySide && layout === 'fill' && 'overflow-y-auto scrollbar-editor'
          )}
          style={gridRowStyle}
        >
          <ImageDiffPane
            label={translate('auto.components.editor.ImageDiffViewer.57aac3979a', 'Original')}
            content={originalContent}
            filePath={filePath}
            mimeType={mimeType}
            zoom={zoom}
            layout={layout}
            annotating={false}
            region={null}
            savedRegions={[]}
            onRegion={() => {}}
            onScroll={syncScroll}
            onSurface={(surface) => {
              surfacesRef.current[0] = surface
            }}
          />
          <ImageDiffPane
            label={translate('auto.components.editor.ImageDiffViewer.a651be62b0', 'Modified')}
            content={modifiedContent}
            filePath={filePath}
            mimeType={mimeType}
            zoom={zoom}
            layout={layout}
            annotating={annotating}
            region={region}
            savedRegions={comments.flatMap((comment) =>
              comment.imageRegion ? [comment.imageRegion] : []
            )}
            onRegion={(next) => {
              setRegion(next)
              setAnnotating(false)
            }}
            onScroll={syncScroll}
            onSurface={(surface) => {
              surfacesRef.current[1] = surface
            }}
          />
        </div>
      )}
      {worktreeId && modifiedContent && (region || comments.length > 0) && (
        <ImageDiffNotesPanel
          worktreeId={worktreeId}
          comments={comments}
          region={region}
          onRegionChange={setRegion}
          body={body}
          onBodyChange={setBody}
          error={error}
          submitting={submitting}
          onSave={() => void saveNote()}
        />
      )}
    </div>
  )
}
