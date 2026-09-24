import type { EmulatorVideoCodec } from '../../../src/shared/emulator-video-protocol'
import type { MobileEmulatorProfile } from './mobile-emulator-types'

export type MobileEmulatorCodecPreference = 'auto' | 'jpeg' | EmulatorVideoCodec

export function mobileEmulatorCodecPreferences(
  supported: Record<EmulatorVideoCodec, boolean>,
  preference: MobileEmulatorCodecPreference,
  profile: MobileEmulatorProfile,
  failed: readonly string[] = []
): (EmulatorVideoCodec | 'jpeg')[] {
  if (preference === 'jpeg') {
    return ['jpeg']
  }
  const ordered: EmulatorVideoCodec[] =
    profile === 'responsive' ? ['h264', 'hevc', 'av1'] : ['av1', 'hevc', 'h264']
  const candidates = preference === 'auto' ? ordered : [preference, ...ordered]
  return [
    ...new Set(candidates.filter((codec) => supported[codec] && !failed.includes(codec))),
    'jpeg'
  ]
}
