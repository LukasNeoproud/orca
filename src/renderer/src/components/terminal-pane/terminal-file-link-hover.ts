import type { ILink } from '@xterm/xterm'
import type { TerminalFileContext } from './terminal-file-path-mapping'
import type { TerminalLinkActionContext } from './terminal-link-action-request'
import { leaveTerminalLinkPreview } from './terminal-link-action-request'
import {
  previewTerminalFileLink,
  type TerminalFileLinkActionDeps
} from './terminal-file-link-actions'
import {
  getTerminalFileOpenHint,
  getTerminalHtmlFileOpenHint,
  getTerminalOrcaFileOpenHint,
  getTerminalWorktreePathOpenHint
} from './terminal-link-open-hints'
import {
  isHtmlFilePath,
  shouldOpenTerminalFileWithSystemDefault
} from './terminal-file-open-routing'

type TerminalFileLinkHoverArgs = {
  actionDeps: TerminalFileLinkActionDeps
  column: number | null
  fileContext: TerminalFileContext
  getLinkActionContext?: () => TerminalLinkActionContext | null
  isWorktreeRoot: boolean
  line: number | null
  linkTooltip: HTMLElement
  mappedPath: string
  openLinkHint: string
}

export function createTerminalFileLinkHoverHandlers({
  actionDeps,
  column,
  fileContext,
  getLinkActionContext,
  isWorktreeRoot,
  line,
  linkTooltip,
  mappedPath,
  openLinkHint
}: TerminalFileLinkHoverArgs): Pick<ILink, 'hover' | 'leave'> {
  return {
    hover: (event) => {
      // Why: only local paths can offer the Shift+modifier system
      // default escape hatch; remote paths may not exist locally.
      const canOpenWithSystemDefault = shouldOpenTerminalFileWithSystemDefault(
        fileContext,
        mappedPath
      )
      const showActions = getLinkActionContext ? getLinkActionContext() !== null : true
      const hint = isWorktreeRoot
        ? getTerminalWorktreePathOpenHint(canOpenWithSystemDefault, showActions)
        : canOpenWithSystemDefault
          ? isHtmlFilePath(mappedPath)
            ? getTerminalHtmlFileOpenHint(showActions)
            : showActions
              ? openLinkHint
              : getTerminalFileOpenHint(false)
          : getTerminalOrcaFileOpenHint(showActions)
      const previewRequested = previewTerminalFileLink(
        mappedPath,
        line,
        column,
        event,
        actionDeps,
        getLinkActionContext?.()
      )
      if (previewRequested) {
        linkTooltip.style.display = 'none'
      } else {
        linkTooltip.textContent = `${mappedPath} (${hint})`
        linkTooltip.style.display = ''
      }
    },
    leave: () => {
      linkTooltip.style.display = 'none'
      leaveTerminalLinkPreview(getLinkActionContext?.())
    }
  }
}
