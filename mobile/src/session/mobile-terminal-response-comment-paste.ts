import type { TerminalModes } from '../terminal/terminal-webview-contract'
import { buildMobileTerminalPasteTextPayload } from './mobile-terminal-paste-text'

export function buildMobileTerminalResponseCommentPaste(
  formattedComment: string,
  modes: TerminalModes
): string {
  return buildMobileTerminalPasteTextPayload(`\n${formattedComment}`, modes, true)
}
