type EncoderConfiguration = {
  codec: 'h264' | 'hevc' | 'av1'
  width: number
  height: number
  fps: number
  bitrate: number
  maxWidth: number
}

export function mobileEncoderInitialization(options: EncoderConfiguration): string {
  return `(async () => {
    if (!globalThis.VideoEncoder) throw new Error('Video encoding is unavailable on this host')
    const options = ${JSON.stringify(options)}
    const config = {
      codec: { h264: 'avc1.420033', hevc: 'hvc1.1.6.L153.B0', av1: 'av01.0.08M.08' }[options.codec],
      width: options.width, height: options.height, bitrate: options.bitrate,
      framerate: options.fps, latencyMode: 'realtime', hardwareAcceleration: 'prefer-hardware',
      ...(options.codec === 'h264' ? { avc: { format: 'annexb' } } : {}),
      ...(options.codec === 'hevc' ? { hevc: { format: 'annexb' } } : {})
    }
    let support = await VideoEncoder.isConfigSupported(config)
    if (!support.supported) {
      config.hardwareAcceleration = 'no-preference'
      support = await VideoEncoder.isConfigSupported(config)
    }
    if (!support.supported) throw new Error(options.codec + ' encoding is unavailable on this host')
    let failure = null
    let frames = []
    let bytesQueued = 0
    let nextFrameAt = -Infinity
    let lastKeyAt = -Infinity
    let lastTimestamp = -1
    let forceNextKey = false
    const canvas = document.createElement('canvas')
    canvas.width = options.width
    canvas.height = options.height
    const context = canvas.getContext('2d')
    const encoder = new VideoEncoder({
      output(chunk) {
        if (failure) return
        if (frames.length >= 120 || bytesQueued + chunk.byteLength > 8 * 1024 * 1024) {
          failure = 'Video encoder output overflow'
          frames = []
          return
        }
        const bytes = new Uint8Array(chunk.byteLength)
        chunk.copyTo(bytes)
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
        }
        frames.push({
          config: false, keyFrame: chunk.type === 'key', timestampUs: chunk.timestamp,
          width: canvas.width, height: canvas.height, base64: btoa(binary)
        })
        bytesQueued += bytes.length
      },
      error(error) { failure = error.message }
    })
    encoder.configure(config)
    globalThis.__orcaEncodeJpeg = async (base64, first) => {
      if (failure) throw new Error(failure)
      const now = performance.now()
      if (!first && (now + 1 < nextFrameAt || encoder.encodeQueueSize > 2)) return
      const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
      try {
        const scale = Math.min(1, options.maxWidth / bitmap.width)
        const width = Math.max(2, Math.floor(bitmap.width * scale / 2) * 2)
        const height = Math.max(2, Math.floor(bitmap.height * scale / 2) * 2)
        if (width !== canvas.width || height !== canvas.height) {
          encoder.reset()
          config.width = width
          config.height = height
          canvas.width = width
          canvas.height = height
          encoder.configure(config)
          forceNextKey = true
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      } finally { bitmap.close() }
      lastTimestamp = Math.max(lastTimestamp + 1, Math.round(now * 1000))
      const frame = new VideoFrame(canvas, { timestamp: lastTimestamp })
      const keyFrame = first || forceNextKey || now - lastKeyAt >= 1000
      forceNextKey = false
      try { encoder.encode(frame, { keyFrame }) } finally { frame.close() }
      const interval = 1000 / options.fps
      nextFrameAt = Number.isFinite(nextFrameAt)
        ? Math.max(nextFrameAt + interval, now + interval / 2)
        : now + interval
      if (keyFrame) lastKeyAt = now
      if (first) {
        await encoder.flush()
        forceNextKey = true
        if (failure) throw new Error(failure)
        if (!frames.length) throw new Error('Video encoder produced no first frame')
      }
    }
    globalThis.__orcaTakeEncodedFrames = () => {
      if (failure) throw new Error(failure)
      const output = frames
      frames = []
      bytesQueued = 0
      return output
    }
  })().catch(error => { throw new Error(String(error)) })`
}
