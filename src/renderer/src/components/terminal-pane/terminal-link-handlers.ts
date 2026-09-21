import type { IDisposable, ILink, ILinkProvider } from '@xterm/xterm'
import {
  extractTerminalFileLinkCandidates,
  extractTerminalFileLinks,
  resolveTerminalFileLink
} from '@/lib/terminal-links'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { isRemoteRuntimeFileOperation, runtimePathExists } from '@/runtime/runtime-file-client'
import {
  buildCandidateLogicalLinesForBufferPosition,
  dedupeLogicalLines
} from './terminal-file-link-hit-testing'
import {
  getTerminalFileContext,
  mapTerminalFilePath,
  terminalLinkWslDistro
} from './terminal-file-open-routing'
import {
  buildHardWrappedPathLogicalLineCandidates,
  buildWrappedLogicalLine,
  rangeForParsedFileLink,
  type WrappedLogicalLine
} from './wrapped-terminal-link-ranges'
import {
  getTerminalPathExistsCacheKey,
  readTerminalPathExistsCache,
  writeTerminalPathExistsCache
} from './terminal-path-exists-cache'
import {
  getTerminalFileOpenHint,
  getTerminalHtmlFileOpenHint,
  getTerminalUrlOpenHint
} from './terminal-link-open-hints'
import { resolveKnownWorktreeRootPathLink } from './terminal-worktree-path-link'
import type { TerminalLinkActionContext } from './terminal-link-action-request'
import { handleTerminalFileLink } from './terminal-file-link-actions'
import { createTerminalFileLinkHoverHandlers } from './terminal-file-link-hover'

export { openDetectedFilePath } from './terminal-file-open-routing'
export { mapTerminalFilePath } from './terminal-file-open-routing'
export { openFilePathLinkAtBufferPosition } from './terminal-file-link-hit-testing'
export { installFilePathLinkClickFallback } from './terminal-file-link-click-fallback'
export { getTerminalFileOpenHint, getTerminalHtmlFileOpenHint, getTerminalUrlOpenHint }
export { isTerminalLinkActivation } from './terminal-link-activation'

export type LinkHandlerDeps = {
  worktreeId: string
  worktreePath: string
  startupCwd: string
  getPaneLinkCwd?: (paneId: number) => string | null
  managerRef: React.RefObject<PaneManager | null>
  linkProviderDisposablesRef: React.RefObject<Map<number, IDisposable>>
  pathExistsCache: Map<string, boolean>
  runtimeEnvironmentId?: string | null
  terminalHomePath?: string | null
  wslDistro?: string | null
  getRuntimeEnvironmentIdForPane?: (paneId: number) => string | null
  getLinkActionContext?: (paneId: number) => TerminalLinkActionContext | null
}

type ProvidedFileLink = {
  link: ILink
  logicalLine: WrappedLogicalLine
}

function rangesOverlap(left: ILink['range'], right: ILink['range']): boolean {
  const leftStartsAfterRightEnds =
    left.start.y > right.end.y || (left.start.y === right.end.y && left.start.x > right.end.x)
  const rightStartsAfterLeftEnds =
    right.start.y > left.end.y || (right.start.y === left.end.y && right.start.x > left.end.x)
  return !leftStartsAfterRightEnds && !rightStartsAfterLeftEnds
}

function preferLongestNonOverlappingLinks(links: ProvidedFileLink[]): ProvidedFileLink[] {
  const selected: ProvidedFileLink[] = []
  const byLengthDescending = [...links].sort(
    (a, b) =>
      b.link.text.length - a.link.text.length ||
      a.link.range.start.y - b.link.range.start.y ||
      a.link.range.start.x - b.link.range.start.x
  )
  for (const link of byLengthDescending) {
    if (!selected.some((existing) => rangesOverlap(existing.link.range, link.link.range))) {
      selected.push(link)
    }
  }
  return selected.sort(
    (a, b) =>
      a.link.range.start.y - b.link.range.start.y || a.link.range.start.x - b.link.range.start.x
  )
}

export function createFilePathLinkProvider(
  paneId: number,
  deps: LinkHandlerDeps,
  linkTooltip: HTMLElement,
  openLinkHint: string
): ILinkProvider {
  const { startupCwd, managerRef, pathExistsCache, worktreeId, worktreePath } = deps
  return {
    provideLinks: (bufferLineNumber, callback) => {
      const pane = managerRef.current?.getPanes().find((candidate) => candidate.id === paneId)
      if (!pane) {
        callback(undefined)
        return
      }

      const buffer = pane.terminal.buffer.active
      const softWrappedLogicalLine = buildWrappedLogicalLine(buffer, bufferLineNumber)
      const logicalLines = dedupeLogicalLines([
        ...buildHardWrappedPathLogicalLineCandidates(buffer, bufferLineNumber),
        ...(softWrappedLogicalLine ? [softWrappedLogicalLine] : [])
      ])
      if (logicalLines.every((logicalLine) => !logicalLine.text)) {
        callback(undefined)
        return
      }

      if (
        logicalLines.every((logicalLine) => extractTerminalFileLinks(logicalLine.text).length === 0)
      ) {
        callback(undefined)
        return
      }

      void Promise.all(
        logicalLines.flatMap((logicalLine) =>
          extractTerminalFileLinkCandidates(logicalLine.text).map(
            async (parsed): Promise<ProvidedFileLink | null> => {
              const paneLinkCwd = deps.getPaneLinkCwd?.(paneId) ?? startupCwd
              const resolved = paneLinkCwd
                ? resolveTerminalFileLink(parsed, paneLinkCwd, deps.terminalHomePath)
                : null
              if (!resolved) {
                return null
              }
              const runtimeEnvironmentId =
                deps.getRuntimeEnvironmentIdForPane?.(paneId) ?? deps.runtimeEnvironmentId ?? null
              const mappedPath = mapTerminalFilePath(
                resolved.absolutePath,
                worktreePath,
                terminalLinkWslDistro(deps.wslDistro, runtimeEnvironmentId)
              )
              const range = rangeForParsedFileLink(logicalLine, parsed.startIndex, parsed.endIndex)
              if (!range) {
                return null
              }

              const fileContext = getTerminalFileContext(
                worktreeId,
                worktreePath,
                runtimeEnvironmentId,
                mappedPath
              )
              const isRemoteRuntimePath = isRemoteRuntimeFileOperation(fileContext, mappedPath)
              const cacheKey = getTerminalPathExistsCacheKey({
                absolutePath: mappedPath,
                connectionId: fileContext.connectionId,
                isRemoteRuntimePath,
                runtimeEnvironmentId
              })
              const worktreeRootLink = resolveKnownWorktreeRootPathLink(mappedPath)
              if (/[\\/]$/.test(parsed.pathText) && !worktreeRootLink) {
                return null
              }
              // Why: exact known workspace roots must stay clickable for SSH or
              // stale local paths even when filesystem probing says "missing".
              if (!worktreeRootLink) {
                const cachedExists = readTerminalPathExistsCache(pathExistsCache, cacheKey)
                const exists =
                  cachedExists ??
                  (fileContext.connectionId || isRemoteRuntimePath
                    ? await runtimePathExists(fileContext, mappedPath)
                    : await window.api.shell.pathExists(mappedPath))
                writeTerminalPathExistsCache(pathExistsCache, cacheKey, exists)
                if (!exists) {
                  return null
                }
              }

              return {
                logicalLine,
                link: {
                  range,
                  text: parsed.displayText,
                  activate: (event) => {
                    if (
                      handleTerminalFileLink(
                        mappedPath,
                        resolved.line,
                        resolved.column,
                        event,
                        {
                          worktreeId,
                          worktreePath,
                          runtimeEnvironmentId,
                          wslDistro: deps.wslDistro
                        },
                        deps.getLinkActionContext?.(paneId)
                      )
                    ) {
                      pane.terminal.clearSelection?.()
                    }
                  },
                  ...createTerminalFileLinkHoverHandlers({
                    actionDeps: {
                      worktreeId,
                      worktreePath,
                      runtimeEnvironmentId,
                      wslDistro: deps.wslDistro
                    },
                    column: resolved.column,
                    fileContext,
                    getLinkActionContext: deps.getLinkActionContext
                      ? () => deps.getLinkActionContext!(paneId)
                      : undefined,
                    isWorktreeRoot: Boolean(worktreeRootLink),
                    line: resolved.line,
                    linkTooltip,
                    mappedPath,
                    openLinkHint
                  })
                }
              }
            }
          )
        )
      )
        .then(
          (resolvedLinks) => {
            const latestFingerprints = new Set(
              buildCandidateLogicalLinesForBufferPosition(buffer, bufferLineNumber).map(
                (logicalLine) => logicalLine.fingerprint
              )
            )
            const providedLinks = resolvedLinks.filter(
              (link): link is ProvidedFileLink => link !== null
            )
            const links = preferLongestNonOverlappingLinks(providedLinks)
              .filter(({ logicalLine }) => latestFingerprints.has(logicalLine.fingerprint))
              .map(({ link }) => link)
            if (providedLinks.length > 0 && links.length === 0) {
              return
            }
            callback(links.length > 0 ? links : undefined)
          },
          () => {
            // Why: remote probes reject during SSH teardown; using the rejection
            // arm avoids treating a consumer callback failure as a probe failure.
            callback(undefined)
          }
        )
        .catch(() => {
          // Link discovery is best-effort; a stale xterm callback must not
          // recreate the unhandled rejection this path is meant to contain.
        })
    }
  }
}
