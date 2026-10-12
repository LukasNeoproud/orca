import type { BrowserScreencastFrame } from '../transport/browser-screencast-protocol'
import { createBrowserFrameDataUri } from '../browser/browser-frame-data-uri'

export type MobileEmulatorFrame = { uri?: string; streamId?: string; width: number; height: number }

export function createMobileEmulatorFrameStore() {
  let frame: MobileEmulatorFrame | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => frame,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear: () => {
      frame = null
      for (const listener of listeners) {
        listener()
      }
    },
    video: (streamId: string, width: number, height: number) => {
      if (frame?.streamId === streamId && frame.width === width && frame.height === height) {
        return
      }
      frame = { streamId, width, height }
      for (const listener of listeners) {
        listener()
      }
    },
    accept: (value: BrowserScreencastFrame) => {
      const width = value.metadata.imageWidth ?? value.metadata.deviceWidth
      const height = value.metadata.imageHeight ?? value.metadata.deviceHeight
      if (!width || !height || width <= 0 || height <= 0) {
        return false
      }
      frame = { uri: createBrowserFrameDataUri(value), width, height }
      for (const listener of listeners) {
        listener()
      }
      return true
    }
  }
}
export type MobileEmulatorFrameStore = ReturnType<typeof createMobileEmulatorFrameStore>
