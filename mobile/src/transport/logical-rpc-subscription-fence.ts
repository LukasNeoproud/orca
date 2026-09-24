import type { RpcClient } from './rpc-client'

export function fenceStreamListener(
  listener: (result: unknown) => void,
  isCurrent: () => boolean
): (result: unknown) => void {
  return (result) => {
    if (isCurrent()) {
      listener(result)
    }
  }
}

export function notifyEmulatorCutover(
  method: string,
  cancelled: boolean,
  listener: (result: unknown) => void
): void {
  if (method === 'emulator.mobile.stream' && !cancelled) {
    listener({ type: 'reconnecting' })
  }
}

export function fenceBinarySubscription(
  options: Parameters<RpcClient['subscribe']>[3],
  isCurrent: () => boolean
): Parameters<RpcClient['subscribe']>[3] {
  const onBinaryFrame = options?.onBinaryFrame
  const onEmulatorVideoFrame = options?.onEmulatorVideoFrame
  if (!onBinaryFrame && !onEmulatorVideoFrame) {
    return options
  }
  return {
    ...options,
    onBinaryFrame: onBinaryFrame
      ? (frame) => {
          if (isCurrent()) {
            onBinaryFrame(frame)
          }
        }
      : undefined,
    onEmulatorVideoFrame: onEmulatorVideoFrame
      ? (frame) => {
          if (isCurrent()) {
            onEmulatorVideoFrame(frame)
          }
        }
      : undefined
  }
}
