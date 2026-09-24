import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileEmulatorVideoEncoder } from './mobile-emulator-video-encoder'

const host = vi.hoisted(() => ({
  execute: vi.fn(),
  destroy: vi.fn(),
  loadFile: vi.fn(),
  rm: vi.fn()
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { executeJavaScript: host.execute }
    loadFile = host.loadFile
    destroy = host.destroy
  },
  nativeImage: { createFromBuffer: () => ({ getSize: () => ({ width: 64, height: 48 }) }) }
}))
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/encoder-test'),
  writeFile: vi.fn(),
  rm: host.rm
}))
beforeEach(() => {
  vi.clearAllMocks()
  host.loadFile.mockResolvedValue(undefined)
  host.execute.mockResolvedValue({ value: undefined })
  host.rm.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())
describe('host video encoder failure lifecycle', () => {
  it('destroys the hidden renderer and removes its temporary page after unsupported codec errors', async () => {
    host.execute.mockResolvedValueOnce({ error: 'AV1 unavailable' })
    await expect(
      MobileEmulatorVideoEncoder.create('av1', { width: 64, fps: 10 }, Buffer.from([1]))
    ).rejects.toThrow('AV1 unavailable')
    expect(host.destroy).toHaveBeenCalledOnce()
    expect(host.rm).toHaveBeenCalledWith('/tmp/encoder-test', { recursive: true, force: true })
  })
  it('bounds a codec probe that never finishes, allowing the caller to try a fallback', async () => {
    vi.useFakeTimers()
    host.execute.mockImplementationOnce(() => new Promise(() => {}))
    const result = MobileEmulatorVideoEncoder.create(
      'hevc',
      { width: 64, fps: 10 },
      Buffer.from([1])
    )
    const assertion = expect(result).rejects.toThrow('Video encoder timed out')
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(host.destroy).toHaveBeenCalledOnce()
    expect(host.rm).toHaveBeenCalledOnce()
  })
  it('does not submit new frames after closure', async () => {
    const encoder = await MobileEmulatorVideoEncoder.create(
      'h264',
      { width: 64, fps: 10 },
      Buffer.from([1])
    )
    encoder.close()
    host.execute.mockClear()
    encoder.feedJpeg(Buffer.from([2]))
    expect(await encoder.takeFrames()).toEqual([])
    expect(host.execute).not.toHaveBeenCalled()
  })
})
