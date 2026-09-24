export type Codec = 'jpeg' | 'h264' | 'hevc' | 'av1'
export type Phase = 'static' | 'scrolling'
export type Packet = { payloadBytes: number; wireBytes: number }
export type Trial = {
  codec: Codec
  phase: Phase
  trial: number
  firstFrameMs: number
  startupPayloadBytes: number
  attempts: number
  packets: number
  payloadBytes: number
  wireBytes: number
  fps: number
  latencyMs: number[]
}

export function percentile(values: number[], percentileValue: number): number {
  if (!values.length) {
    return Number.NaN
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)]
}

export function trialResult(
  codec: Codec,
  phase: Phase,
  trial: number,
  firstFrameMs: number,
  startupPayloadBytes: number,
  attempts: number,
  packets: Packet[],
  latencyMs: number[],
  phaseMs: number
): Trial {
  return {
    codec,
    phase,
    trial,
    firstFrameMs,
    startupPayloadBytes,
    attempts,
    packets: packets.length,
    payloadBytes: packets.reduce((sum, packet) => sum + packet.payloadBytes, 0),
    wireBytes: packets.reduce((sum, packet) => sum + packet.wireBytes, 0),
    fps: packets.length / (phaseMs / 1000),
    latencyMs
  }
}
