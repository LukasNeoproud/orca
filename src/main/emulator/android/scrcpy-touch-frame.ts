// scrcpy 2.4 control message 2: one pointer, big-endian position and screen size.
export type ScrcpyTouchPhase = 'down' | 'move' | 'up' | 'cancel'

export function encodeScrcpyTouchFrame(
  phase: ScrcpyTouchPhase,
  x: number,
  y: number,
  width: number,
  height: number
): Buffer {
  const frame = Buffer.alloc(32)
  frame[0] = 2
  frame[1] = { down: 0, up: 1, move: 2, cancel: 3 }[phase]
  frame.writeBigUInt64BE(0n, 2)
  frame.writeInt32BE(Math.round(Math.min(1, Math.max(0, x)) * (width - 1)), 10)
  frame.writeInt32BE(Math.round(Math.min(1, Math.max(0, y)) * (height - 1)), 14)
  frame.writeUInt16BE(width, 18)
  frame.writeUInt16BE(height, 20)
  frame.writeUInt16BE(phase === 'up' || phase === 'cancel' ? 0 : 0xffff, 22)
  return frame
}
