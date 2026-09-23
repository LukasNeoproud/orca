import type { TerminalLinkActionTarget } from '../terminal/terminal-webview-contract'
import type { MobileMarkdownLinkTarget } from '../components/MobileMarkdown'
import type { RuntimeNativeChatFileContext } from '../../../src/shared/runtime-types'
import type { MobileContextualFileTarget } from '../files/mobile-contextual-file-preview'

export type MobileLinkActionTarget =
  | ({ source: 'terminal'; terminalHandle: string; cwd?: string } & TerminalLinkActionTarget)
  | ({
      source: 'chat'
      nativeChatContext?: RuntimeNativeChatFileContext
    } & MobileMarkdownLinkTarget)

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

export function contextualFileTargetForMobileLink(
  target: Extract<MobileLinkActionTarget, { kind: 'file' }>
): MobileContextualFileTarget {
  if (target.source === 'terminal') {
    return {
      pathText: target.pathText,
      line: target.line,
      column: target.column,
      terminalHandle: target.terminalHandle,
      ...(target.cwd ? { cwd: target.cwd } : {})
    }
  }
  return {
    pathText: target.pathText,
    line: null,
    column: null,
    ...(target.nativeChatContext ? { nativeChatContext: target.nativeChatContext } : {})
  }
}
