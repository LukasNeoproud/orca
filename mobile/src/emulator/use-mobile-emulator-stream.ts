import { MobileEmulatorVideoQueue } from './mobile-emulator-video-queue'
import {
  mobileEmulatorCodecPreferences,
  type MobileEmulatorCodecPreference
} from './mobile-emulator-codec-preferences'
import {
  getMobileEmulatorVideoCapabilities,
  submitMobileEmulatorVideoFrame,
  closeMobileEmulatorVideoStream
} from './mobile-emulator-native-video'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { MobileEmulatorInputQueue } from './mobile-emulator-input-queue'
import { createMobileEmulatorFrameStore } from './mobile-emulator-frame-store'
import type { MobileEmulatorInput, MobileEmulatorProfile } from './mobile-emulator-types'

export function useMobileEmulatorStream(
  client: RpcClient | null,
  deviceId: string,
  profile: MobileEmulatorProfile,
  active: boolean,
  codecPreference: MobileEmulatorCodecPreference = 'auto',
  visible = true
) {
  const [frames] = useState(createMobileEmulatorFrameStore)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [videoCodec, setVideoCodec] = useState('jpeg')
  const [failedCodecs, setFailedCodecs] = useState<string[]>([])
  const [codecNotice, setCodecNotice] = useState<string | null>(null)
  const videoRenderedRef = useRef<(id: string, width: number, height: number) => void>(() => {})
  const videoErrorRef = useRef<(id: string, message: string) => void>(() => {})
  const queueRef = useRef<MobileEmulatorInputQueue | null>(null)
  const visibleRef = useRef(visible)
  const updateVisibilityRef = useRef<(visible: boolean) => void>(() => {})
  visibleRef.current = visible

  useEffect(() => {
    frames.clear()
    setReady(false)
    setError(null)
    if (!client || !active) {
      return
    }
    let disposed = false
    let failed = false
    let subscriptionId: string | null = null
    let receivedFrame = false
    let negotiatedCodec = 'jpeg'
    let videoQueue: MobileEmulatorVideoQueue | null = null
    let cancelStream: (() => void) | undefined
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      queueRef.current?.dispose()
      queueRef.current = null
      videoQueue?.dispose()
      videoQueue = null
      if (subscriptionId) {
        void closeMobileEmulatorVideoStream(subscriptionId).catch(() => {})
      }
      subscriptionId = null
      clearTimeout(watchdog)
      cancelStream?.()
      cancelStream = undefined
    }
    const fail = (cause: unknown) => {
      if (disposed || failed) {
        return
      }
      failed = true
      stop()
      setReady(false)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Emulator stream interrupted. Reconnect to continue.'
      )
    }
    const failVideo = (cause: unknown) => {
      if (disposed || failed) {
        return
      }
      if (negotiatedCodec === 'jpeg') {
        fail(cause)
        return
      }
      failed = true
      stop()
      setReady(false)
      setCodecNotice(`${negotiatedCodec.toUpperCase()} unavailable; trying another format.`)
      setFailedCodecs((previous) => [...new Set([...previous, negotiatedCodec])])
    }
    videoRenderedRef.current = (id, width, height) => {
      if (disposed || failed || id !== subscriptionId) {
        return
      }
      receivedFrame = true
      frames.video(id, width, height)
      setReady(true)
      armWatchdog(15_000)
    }
    videoErrorRef.current = (id, message) => {
      if (id === subscriptionId) {
        failVideo(new Error(message))
      }
    }
    const armWatchdog = (delay: number) => {
      clearTimeout(watchdog)
      if (delay === 15_000 && negotiatedCodec !== 'jpeg' && !visibleRef.current) {
        return
      }
      watchdog = setTimeout(
        () => failVideo(new Error('No emulator frames received. Reconnect to try again.')),
        delay
      )
    }
    updateVisibilityRef.current = (isVisible) => {
      if (!subscriptionId || failed || disposed || negotiatedCodec === 'jpeg') {
        return
      }
      if (isVisible) {
        armWatchdog(15_000)
      } else {
        clearTimeout(watchdog)
      }
    }
    const resetInput = () => {
      queueRef.current?.dispose()
      queueRef.current = null
      videoQueue?.dispose()
      videoQueue = null
      if (subscriptionId) {
        void closeMobileEmulatorVideoStream(subscriptionId).catch(() => {})
      }
      subscriptionId = null
      receivedFrame = false
      frames.clear()
      setReady(false)
    }
    const activateInput = (owner: string) => {
      queueRef.current = new MobileEmulatorInputQueue(async (action) => {
        if (client.getState() !== 'connected') {
          throw new Error('Emulator disconnected.')
        }
        const result = await client.sendRequest(
          'emulator.mobile.input',
          { subscriptionId: owner, action },
          { failWhenDisconnected: true, timeoutMs: 5000, budgetSpansConnect: true }
        )
        if (!result.ok) {
          throw new Error(result.error.message)
        }
      }, fail)
    }
    const stopState = client.onStateChange((state) => {
      if (state !== 'connected') {
        fail(new Error('Connection interrupted. Reconnect to continue.'))
      }
    })
    armWatchdog(210_000)
    const subscribe = async () => {
      const capabilities = await getMobileEmulatorVideoCapabilities()
      if (disposed || failed) {
        return
      }
      const videoCodecs = mobileEmulatorCodecPreferences(
        capabilities,
        codecPreference,
        profile,
        failedCodecs
      )
      cancelStream = client.subscribe(
        'emulator.mobile.stream',
        { deviceId, profile, videoCodecs },
        (payload) => {
          if (disposed || failed) {
            return
          }
          const event = payload as {
            videoCodec?: string
            type?: string
            subscriptionId?: string
            message?: string
            error?: { message?: string }
          }
          if (event.type === 'ready' && typeof event.subscriptionId === 'string') {
            resetInput()
            subscriptionId = event.subscriptionId
            negotiatedCodec = event.videoCodec ?? 'jpeg'
            setVideoCodec(negotiatedCodec)
            setCodecNotice(
              codecPreference !== 'auto' && codecPreference !== negotiatedCodec
                ? `${codecPreference.toUpperCase()} unavailable; using ${negotiatedCodec.toUpperCase()}.`
                : failedCodecs.length
                  ? `Using ${negotiatedCodec.toUpperCase()} after decoder fallback.`
                  : null
            )
            activateInput(event.subscriptionId)
            if (negotiatedCodec !== 'jpeg') {
              videoQueue = new MobileEmulatorVideoQueue(submitMobileEmulatorVideoFrame, failVideo)
            }
            armWatchdog(15_000)
          } else if (event.type === 'reconnecting' || event.type === 'starting') {
            resetInput()
            armWatchdog(210_000)
          } else if (event.type === 'heartbeat' && receivedFrame) {
            armWatchdog(15_000)
          } else if (event.type === 'error' || event.type === 'end' || event.error) {
            fail(new Error(event.message ?? event.error?.message ?? 'Emulator stream ended.'))
          }
        },
        {
          onEmulatorVideoFrame: (frame) => {
            if (
              disposed ||
              failed ||
              frame.subscriptionId !== subscriptionId ||
              frame.codec !== negotiatedCodec
            ) {
              return
            }
            if (frames.getSnapshot()?.streamId !== frame.subscriptionId) {
              frames.video(frame.subscriptionId, frame.width, frame.height)
            }
            videoQueue?.enqueue(frame)
            if (receivedFrame) {
              armWatchdog(15_000)
            }
          },
          onBinaryFrame: (frame) => {
            if (disposed || failed || !subscriptionId || negotiatedCodec !== 'jpeg') {
              return
            }
            if (frames.accept(frame)) {
              receivedFrame = true
              setReady(true)
              armWatchdog(15_000)
            }
          }
        }
      )
      if (failed || disposed) {
        stop()
      }
    }
    void subscribe().catch(fail)
    return () => {
      disposed = true
      updateVisibilityRef.current = () => {}
      stopState()
      stop()
      frames.clear()
    }
  }, [active, attempt, client, codecPreference, deviceId, failedCodecs, frames, profile])

  useEffect(() => updateVisibilityRef.current(visible), [visible])

  const sendInput = useCallback(
    (action: MobileEmulatorInput) => {
      if (ready) {
        queueRef.current?.enqueue(action)
      }
    },
    [ready]
  )
  const retry = useCallback(() => {
    setFailedCodecs([])
    setCodecNotice(null)
    setAttempt((value) => value + 1)
  }, [])
  const restartVideo = useCallback(() => setAttempt((value) => value + 1), [])
  const onVideoRendered = useCallback(
    (id: string, width: number, height: number) => videoRenderedRef.current(id, width, height),
    []
  )
  const onVideoError = useCallback(
    (id: string, message: string) => videoErrorRef.current(id, message),
    []
  )
  return {
    frames,
    ready,
    error,
    retry,
    sendInput,
    videoCodec,
    codecNotice,
    onVideoRendered,
    onVideoError,
    restartVideo
  }
}
