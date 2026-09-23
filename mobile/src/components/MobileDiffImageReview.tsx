import { useMemo, useRef, useState } from 'react'
import { Image, PanResponder, Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import { Crosshair, MessageSquarePlus, ZoomIn, ZoomOut } from 'lucide-react-native'
import type { DiffComment, ImageReviewRegion } from '../../../src/shared/diff-comment-types'
import type { ReviewDiffState, ReviewImageSide } from '../session/mobile-diff-review-screen-model'
import {
  mobileImageRegionFromDrag,
  mobileImageRegionLayout,
  type MobileImageViewport
} from '../session/mobile-image-review-region'
import { colors } from '../theme/mobile-theme'
import { mobileDiffImageReviewStyles as styles } from './mobile-diff-image-review-styles'

type ImageDiffState = Extract<ReviewDiffState, { kind: 'image' }>
type ImageSideName = 'original' | 'modified'
type Point = { x: number; y: number }

type Props = {
  comments: DiffComment[]
  diffState: ImageDiffState
  staleCommentIds: ReadonlySet<string>
  onAddNote: (region: ImageReviewRegion) => void
  onEditNote: (comment: DiffComment) => void
}

export function MobileDiffImageReview({
  comments,
  diffState,
  staleCommentIds,
  onAddNote,
  onEditNote
}: Props) {
  const initialSide: ImageSideName = diffState.modified.kind === 'ready' ? 'modified' : 'original'
  const [side, setSide] = useState<ImageSideName>(initialSide)
  const [zoom, setZoom] = useState(1)
  const [canvas, setCanvas] = useState({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [selecting, setSelecting] = useState(false)
  const [draftRegion, setDraftRegion] = useState<ImageReviewRegion | null>(null)
  const dragStart = useRef<Point | null>(null)
  const active = diffState[side]
  const viewport: MobileImageViewport = {
    width: canvas.width,
    height: canvas.height,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    zoom
  }

  const selectionPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => selecting && side === 'modified',
        onMoveShouldSetPanResponder: () => selecting && side === 'modified',
        onPanResponderGrant: (event) => {
          dragStart.current = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY
          }
          setDraftRegion(null)
        },
        onPanResponderMove: (event) => {
          const start = dragStart.current
          if (!start) {
            return
          }
          setDraftRegion(
            mobileImageRegionFromDrag(
              start,
              { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
              viewport
            )
          )
        },
        onPanResponderRelease: () => {
          dragStart.current = null
          setSelecting(false)
        },
        onPanResponderTerminate: () => {
          dragStart.current = null
          setSelecting(false)
        }
      }),
    [selecting, side, viewport]
  )

  const handleLayout = (event: LayoutChangeEvent) => {
    setCanvas({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height
    })
  }

  return (
    <View style={styles.root}>
      <ImageReviewToolbar
        diffState={diffState}
        side={side}
        zoom={zoom}
        onChangeSide={(next) => {
          setSide(next)
          setImageSize({ width: 0, height: 0 })
          setDraftRegion(null)
          setSelecting(false)
        }}
        onChangeZoom={setZoom}
      />
      <View style={styles.canvas} onLayout={handleLayout} {...selectionPan.panHandlers}>
        <ImageSideState side={active} zoom={zoom} onImageSize={setImageSize} />
        {active.kind === 'ready' && side === 'modified' ? (
          <View style={styles.selectionLayer} pointerEvents="box-none">
            {comments.map((comment) => (
              <ImageCommentRegion
                key={comment.id}
                comment={comment}
                viewport={viewport}
                stale={staleCommentIds.has(comment.id)}
                onPress={() => onEditNote(comment)}
              />
            ))}
            {draftRegion ? (
              <View
                pointerEvents="none"
                style={[
                  styles.region,
                  styles.draftRegion,
                  mobileImageRegionLayout(draftRegion, viewport)
                ]}
              />
            ) : null}
          </View>
        ) : null}
        {selecting ? (
          <Text style={styles.instruction}>Drag across the changed image to mark an area.</Text>
        ) : null}
        {active.kind === 'ready' && side === 'modified' ? (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.76 }]}
              onPress={() => {
                setDraftRegion(null)
                setSelecting(true)
              }}
              accessibilityRole="button"
              accessibilityLabel="Select image area"
            >
              <Crosshair size={17} color={colors.textPrimary} />
              <Text style={styles.actionText}>{draftRegion ? 'Reselect area' : 'Select area'}</Text>
            </Pressable>
            {draftRegion ? (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonPrimary,
                  pressed && { opacity: 0.76 }
                ]}
                onPress={() => onAddNote(draftRegion)}
                accessibilityRole="button"
                accessibilityLabel="Add note to selected image area"
              >
                <MessageSquarePlus size={17} color={colors.bgBase} />
                <Text style={[styles.actionText, styles.actionTextPrimary]}>Add note</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function ImageReviewToolbar({
  diffState,
  side,
  zoom,
  onChangeSide,
  onChangeZoom
}: {
  diffState: ImageDiffState
  side: ImageSideName
  zoom: number
  onChangeSide: (side: ImageSideName) => void
  onChangeZoom: (zoom: number) => void
}) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.sideSwitch}>
        {(['original', 'modified'] as const).map((name) => {
          const selected = side === name
          return (
            <Pressable
              key={name}
              style={[styles.sideButton, selected && styles.sideButtonActive]}
              onPress={() => onChangeSide(name)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={name === 'original' ? 'Original image' : 'Changed image'}
            >
              <Text style={[styles.sideButtonText, selected && styles.sideButtonTextActive]}>
                {name === 'original' ? 'Original' : 'Changed'}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.zoomRow}>
        <ZoomButton
          label="Zoom out"
          disabled={zoom <= 1 || diffState[side].kind !== 'ready'}
          onPress={() => onChangeZoom(Math.max(1, zoom - 0.5))}
          icon="out"
        />
        <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
        <ZoomButton
          label="Zoom in"
          disabled={zoom >= 3 || diffState[side].kind !== 'ready'}
          onPress={() => onChangeZoom(Math.min(3, zoom + 0.5))}
          icon="in"
        />
      </View>
    </View>
  )
}

function ZoomButton({
  label,
  disabled,
  onPress,
  icon
}: {
  label: string
  disabled: boolean
  onPress: () => void
  icon: 'in' | 'out'
}) {
  const Icon = icon === 'in' ? ZoomIn : ZoomOut
  return (
    <Pressable
      style={[styles.iconButton, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={17} color={colors.textPrimary} />
    </Pressable>
  )
}

function ImageSideState({
  side,
  zoom,
  onImageSize
}: {
  side: ReviewImageSide
  zoom: number
  onImageSize: (size: { width: number; height: number }) => void
}) {
  if (side.kind === 'ready') {
    return (
      <Image
        source={{ uri: side.uri }}
        style={[styles.image, { transform: [{ scale: zoom }] }]}
        resizeMode="contain"
        onLoad={(event) => onImageSize(event.nativeEvent.source)}
        accessibilityLabel="Image diff preview"
      />
    )
  }
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>
        {side.kind === 'absent' ? 'No Image' : 'Preview Unavailable'}
      </Text>
      <Text style={styles.stateText}>
        {side.kind === 'absent'
          ? 'This side does not exist for the added or deleted file.'
          : 'The image could not be loaded within the mobile preview limits.'}
      </Text>
    </View>
  )
}

function ImageCommentRegion({
  comment,
  viewport,
  stale,
  onPress
}: {
  comment: DiffComment
  viewport: MobileImageViewport
  stale: boolean
  onPress: () => void
}) {
  if (!comment.imageRegion) {
    return null
  }
  const layout = mobileImageRegionLayout(comment.imageRegion, viewport)
  if (!layout) {
    return null
  }
  return (
    <Pressable
      style={[styles.region, stale && styles.staleRegion, layout]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit image note: ${comment.body}`}
    />
  )
}
