import type { EmulatorBridge } from './emulator-bridge'
import type { EmulatorDevice } from './backends/emulator-backend'
import type { ScrcpyStreamSession } from './android/scrcpy-stream-session'
import { MobileEmulatorEncodedSender } from './mobile-emulator-encoded-sender'
import type { MobileEmulatorVideoCodec } from './mobile-emulator-contract'

type Profile = { width: number; fps: number; bitRate: number }
type AndroidEncodedSession = { session: ScrcpyStreamSession; sender: MobileEmulatorEncodedSender }

export async function startMobileAndroidEncodedSession(args: {
  bridge: EmulatorBridge
  serial: string
  profile: Profile
  videoCodecs: MobileEmulatorVideoCodec[]
  subscriptionId: string
  device: EmulatorDevice
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  emit: (value: unknown) => void
  fail: (error: unknown) => void
  isStopped: () => boolean
}): Promise<AndroidEncodedSession | null> {
  for (const codec of args.videoCodecs) {
    if (codec === 'jpeg' || args.isStopped()) {
      break
    }
    const sender = new MobileEmulatorEncodedSender(args.subscriptionId, args.sendBinary)
    let meta = { codecId: '', width: 0, height: 0 }
    let active = false
    let session: ScrcpyStreamSession | null = null
    const serverCodec = codec === 'hevc' ? 'h265' : codec
    try {
      session = await args.bridge.startMobileAndroidVideoSession({
        serial: args.serial,
        codec: serverCodec,
        profile: args.profile,
        callbacks: {
          onMeta: (value) => {
            meta = value
          },
          onFrame: (frame) =>
            sender.push({
              codec,
              config: frame.config,
              keyFrame: frame.keyFrame,
              width: meta.width,
              height: meta.height,
              timestampUs: Number(frame.pts),
              data: frame.data
            }),
          onError: (message) => {
            if (active) {
              args.fail(new Error(message))
            }
          },
          onClose: () => {
            if (active) {
              args.fail(new Error('Android video stream closed'))
            }
          }
        }
      })
      if (args.isStopped() || meta.codecId !== serverCodec) {
        session.close()
        sender.stop()
        continue
      }
      active = true
      args.emit({
        type: 'ready',
        subscriptionId: args.subscriptionId,
        device: args.device,
        videoCodec: codec
      })
      sender.start()
      return { session, sender }
    } catch (error) {
      session?.close()
      sender.stop()
      if (active) {
        throw error
      }
    }
  }
  return null
}
