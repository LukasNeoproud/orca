import type { TerminalLinkActionTarget } from '../terminal/terminal-webview-contract'
import type { MobileMarkdownLinkTarget } from '../components/MobileMarkdown'

export type MobileLinkActionTarget =
  | ({ source: 'terminal'; terminalHandle: string } & TerminalLinkActionTarget)
  | ({ source: 'chat' } & MobileMarkdownLinkTarget)

export function mobileLinkActionDestination(target: MobileLinkActionTarget): string {
  if (target.kind === 'web') {
    return target.url
  }
  if (target.source === 'terminal' && target.line !== null) {
    return `${target.pathText}:${target.line}${target.column === null ? '' : `:${target.column}`}`
  }
  return target.pathText
}

export function mobileLinkActionTitle(target: MobileLinkActionTarget): string {
  const destination = mobileLinkActionDestination(target)
  if (target.kind === 'web') {
    try {
      return new URL(destination).hostname
    } catch {
      return destination
    }
  }
  return destination.split(/[\\/]/).findLast(Boolean) ?? destination
}
