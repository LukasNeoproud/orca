import type { EmulatorDevice } from './backends/emulator-backend'
import type { MobileEmulatorFrameSender } from './mobile-emulator-frame-sender'
import { MobileEmulatorVideoDecoder } from './mobile-emulator-video-decoder'
import { scrcpyVideoRegistry } from './scrcpy-video-registry'

type Profile = { width: number; fps: number; jpegQuality: number }

export class MobileEmulatorAndroidJpegSource {
  private decoder: MobileEmulatorVideoDecoder | null = null
  private unsubscribeVideo: (() => void) | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  private pollBusy = false
  private stopped = false

  constructor(
    private readonly serial: string,
    private readonly subscriptionId: string,
    private readonly device: EmulatorDevice,
    private readonly profile: Profile,
    private readonly frames: MobileEmulatorFrameSender,
    private readonly emit: (value: unknown) => void,
    private readonly fail: (error: unknown) => void
  ) {}

  async start(): Promise<void> {
    const decoder = await MobileEmulatorVideoDecoder.create(
      this.profile.width,
      this.profile.jpegQuality,
      this.profile.fps
    )
    if (this.stopped) {
      decoder.close()
      return
    }
    this.decoder = decoder
    this.emit({
      type: 'ready',
      subscriptionId: this.subscriptionId,
      device: this.device,
      videoCodec: 'jpeg'
    })
    this.unsubscribeVideo = scrcpyVideoRegistry.subscribe(this.serial, (event) => {
      if (event.type === 'frame') {
        decoder.feed(event.frame)
      }
    })
    this.poll = setInterval(() => this.takeImage(), Math.floor(1000 / this.profile.fps))
  }

  stop(): void {
    if (this.stopped) {
      return
    }
    this.stopped = true
    this.unsubscribeVideo?.()
    this.decoder?.close()
    if (this.poll) {
      clearInterval(this.poll)
    }
  }

  private takeImage(): void {
    if (this.pollBusy || !this.decoder) {
      return
    }
    this.pollBusy = true
    void this.decoder
      .takeImage()
      .then((image) => {
        if (!image || this.stopped) {
          return
        }
        scrcpyVideoRegistry.setVideoSize(this.serial, image.deviceWidth, image.deviceHeight)
        this.frames.queueJpeg(Buffer.from(image.image, 'base64'), {
          width: image.width,
          height: image.height,
          deviceWidth: image.deviceWidth,
          deviceHeight: image.deviceHeight
        })
      })
      .catch((error: unknown) => this.fail(error))
      .finally(() => {
        this.pollBusy = false
      })
  }
}
