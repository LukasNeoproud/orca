import { describe, expect, it } from 'vitest'
import type { TerminalModes } from '../terminal/terminal-webview-contract'
import { buildMobileTerminalPasteTextPayload } from './mobile-terminal-paste-text'

const alternateScreenModes: TerminalModes = {
  bracketedPasteMode: true,
  altScreen: true,
  mouseTrackingMode: 'none',
  sgrMouseMode: false,
  sgrMousePixelsMode: false
}

describe('buildMobileTerminalPasteTextPayload', () => {
  it('protects generated comments in an alternate-screen agent UI', () => {
    expect(
      buildMobileTerminalPasteTextPayload('> quote\n\nComment: note', alternateScreenModes, true)
    ).toBe('\x1b[200~> quote\n\nComment: note\x1b[201~')
  })

  it('removes embedded paste terminators from protected text', () => {
    expect(buildMobileTerminalPasteTextPayload('a\x1b[201~b', alternateScreenModes, true)).toBe(
      '\x1b[200~ab\x1b[201~'
    )
  })
})
