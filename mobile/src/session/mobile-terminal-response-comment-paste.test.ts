import { describe, expect, it } from 'vitest'
import type { TerminalModes } from '../terminal/terminal-webview-contract'
import { buildMobileTerminalResponseCommentPaste } from './mobile-terminal-response-comment-paste'

const agentModes: TerminalModes = {
  bracketedPasteMode: true,
  altScreen: true,
  mouseTrackingMode: 'none',
  sgrMouseMode: false,
  sgrMousePixelsMode: false
}

describe('buildMobileTerminalResponseCommentPaste', () => {
  it('separates the comment from live draft text inside protected paste', () => {
    expect(buildMobileTerminalResponseCommentPaste('> quote\n\nComment: note', agentModes)).toBe(
      '\x1b[200~\n> quote\n\nComment: note\x1b[201~'
    )
  })
})
