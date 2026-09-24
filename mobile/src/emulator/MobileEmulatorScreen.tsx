import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { NativeEmulatorVideoView } from './mobile-emulator-native-video'
import { Image, View, type GestureResponderEvent } from 'react-native'
import type { MobileEmulatorFrameStore } from './mobile-emulator-frame-store'
import type { MobileEmulatorInput } from './mobile-emulator-types'
import { mapEmulatorTouch, type EmulatorPoint } from './mobile-emulator-touch'
import { emulatorStyles as styles } from './MobileEmulatorPane.styles'

type Props = {
  frames: MobileEmulatorFrameStore
  enabled: boolean
  sendInput: (input: MobileEmulatorInput) => void
  onVideoRendered?: (id: string, width: number, height: number) => void
  onVideoError?: (id: string, message: string) => void
}

export function MobileEmulatorScreen({
  frames,
  enabled,
  sendInput,
  onVideoRendered,
  onVideoError
}: Props) {
  const frame = useSyncExternalStore(frames.subscribe, frames.getSnapshot, frames.getSnapshot)
  const [layout, setLayout] = useState({ width: 0, height: 0 })
  const sendTouch = (input: MobileEmulatorInput) =>
    sendInput(
      input.type === 'touch' && frame?.streamId
        ? { ...input, videoWidth: frame.width, videoHeight: frame.height }
        : input
    )
  const held = useRef<EmulatorPoint | null>(null)
  const sendRef = useRef(sendTouch)
  sendRef.current = sendTouch
  useEffect(
    () => () => {
      if (held.current) {
        sendRef.current({ type: 'touch', phase: 'cancel', ...held.current })
      }
    },
    []
  )
  useEffect(() => {
    if (!enabled) {
      held.current = null
    }
  }, [enabled])
  const map = (event: GestureResponderEvent, clamp = false) =>
    frame
      ? mapEmulatorTouch(
          { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
          layout,
          frame,
          clamp
        )
      : null
  const finish = (event: GestureResponderEvent, phase: 'up' | 'cancel') => {
    if (!held.current) {
      return
    }
    const point = map(event, true) ?? held.current
    held.current = null
    sendTouch({ type: 'touch', phase, ...point })
  }
  return (
    <View
      style={styles.screen}
      testID="emulator-screen"
      accessibilityLabel="Emulator screen. Touch to control the selected device."
      onLayout={(event) => {
        if (held.current) {
          sendTouch({ type: 'touch', phase: 'cancel', ...held.current })
          held.current = null
        }
        setLayout(event.nativeEvent.layout)
      }}
      onStartShouldSetResponder={(event) => enabled && Boolean(map(event))}
      onResponderGrant={(event) => {
        const point = map(event)
        if (!enabled || !point) {
          return
        }
        held.current = point
        sendTouch({ type: 'touch', phase: 'down', ...point })
      }}
      onResponderMove={(event) => {
        if (!held.current) {
          return
        }
        const point = map(event, true)
        if (point) {
          held.current = point
          sendTouch({ type: 'touch', phase: 'move', ...point })
        }
      }}
      onResponderRelease={(event) => finish(event, 'up')}
      onResponderTerminate={(event) => finish(event, 'cancel')}
      onResponderTerminationRequest={() => true}
    >
      {frame ? (
        <View pointerEvents="none" style={styles.image}>
          {frame.streamId ? (
            <NativeEmulatorVideoView
              key={frame.streamId}
              streamId={frame.streamId}
              style={styles.image}
              onRendered={(event) =>
                onVideoRendered?.(
                  frame.streamId!,
                  event.nativeEvent.width,
                  event.nativeEvent.height
                )
              }
              onError={(event) => onVideoError?.(frame.streamId!, event.nativeEvent.message)}
            />
          ) : (
            <Image
              style={styles.image}
              source={{ uri: frame.uri }}
              resizeMode="contain"
              fadeDuration={0}
            />
          )}
        </View>
      ) : null}
    </View>
  )
}
