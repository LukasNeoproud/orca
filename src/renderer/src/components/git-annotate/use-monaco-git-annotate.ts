import { useCallback, useEffect, useMemo } from 'react'
import type { editor } from 'monaco-editor'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  resolveGitAnnotateFileContext,
  type GitAnnotateFileContext
} from './git-annotate-file-context'
import {
  computeGitAnnotateGutterLayout,
  formatGitAnnotateHover,
  GIT_ANNOTATE_COMMIT_ATTRIBUTE,
  renderGitAnnotateGutterLine
} from './git-annotate-gutter-html'
import { probeGitAnnotateHostSupport } from './git-annotate-host-support'
import { useGitAnnotateStore } from './git-annotate-store'
import { openCommitInGitGraph } from './open-commit-in-git-graph'
import { showGitLineHistory } from './show-git-line-history'
import { useGitAnnotateLines } from './use-git-annotate-lines'
import './git-annotate-gutter.css'

// Monaco's MouseTargetType.GUTTER_LINE_NUMBERS; the enum lives in the runtime module.
const GUTTER_LINE_NUMBERS_TARGET = 3

/** What the editor's menus need to offer the annotate actions for one file. */
export type GitAnnotateMenu = {
  annotated: boolean
  /** Set when the actions are off, with the reason to show beside them. */
  disabledReason: string | null
  toggleAnnotations: () => void
  showLineHistory: (startLine: number, endLine: number) => void
}

export type MonacoGitAnnotate = {
  /** Null where Git cannot annotate the file, so no action is offered. */
  menu: GitAnnotateMenu | null
  /** Monaco `lineNumbers` and `lineNumbersMinChars` while annotations are shown. */
  lineNumbers: ((lineNumber: number) => string) | null
  lineNumbersMinChars: number | null
}

export function useMonacoGitAnnotate({
  mountedEditor,
  fileId,
  modelUri
}: {
  mountedEditor: editor.IStandaloneCodeEditor | null
  fileId: string
  modelUri: string
}): MonacoGitAnnotate {
  // Why a key: the resolver builds a fresh object per call, which would re-run every effect.
  const contextKey = useAppStore((state) => {
    const context = resolveGitAnnotateFileContext(state, fileId)
    return context
      ? JSON.stringify([context.hostKey, context.worktreeId, context.relativePath])
      : null
  })
  const context = useMemo<GitAnnotateFileContext | null>(
    () => (contextKey ? resolveGitAnnotateFileContext(useAppStore.getState(), fileId) : null),
    [contextKey, fileId]
  )
  const unsupported = useGitAnnotateStore((state) =>
    context ? state.hostSupport[context.hostKey] === 'unsupported' : false
  )
  const annotated = useGitAnnotateStore((state) => Boolean(state.annotatedModels[modelUri]))
  const lines = useGitAnnotateLines({
    mountedEditor,
    modelUri,
    fileId,
    context: unsupported ? null : context,
    annotated
  })

  useEffect(() => {
    if (context) {
      probeGitAnnotateHostSupport(context)
    }
  }, [context])

  const toggleAnnotations = useCallback((): void => {
    const store = useGitAnnotateStore.getState()
    store.setAnnotated(modelUri, !store.annotatedModels[modelUri])
  }, [modelUri])

  const showLineHistory = useCallback(
    (startLine: number, endLine: number): void => {
      if (!context) {
        return
      }
      const file = useAppStore.getState().openFiles.find((entry) => entry.id === fileId)
      if (file?.isDirty) {
        // Why: the history is read from the saved file, whose lines unsaved edits have shifted.
        toast.info(
          translate('gitAnnotate.saveFirst', 'Save the file to see the history of its lines.')
        )
        return
      }
      void showGitLineHistory(context, { startLine, endLine })
    },
    [context, fileId]
  )

  const uncommittedLabel = translate('gitAnnotate.uncommitted', 'Uncommitted')
  const gutter = useMemo(() => {
    if (!lines) {
      return null
    }
    const layout = computeGitAnnotateGutterLayout(lines, uncommittedLabel)
    return {
      minChars: layout.minChars,
      render: (lineNumber: number): string =>
        renderGitAnnotateGutterLine(
          lines[lineNumber - 1] ?? null,
          lineNumber,
          layout,
          uncommittedLabel
        )
    }
  }, [lines, uncommittedLabel])

  // Hover: one decoration per group carries the commit's subject for Monaco's gutter hover.
  useEffect(() => {
    const model = mountedEditor?.getModel()
    if (!mountedEditor || !model || !lines) {
      return
    }
    const hint = translate('gitAnnotate.hoverHint', 'Click to show the commit in the Git graph')
    const uncommittedHover = translate('gitAnnotate.uncommittedHover', 'Not committed yet')
    const decorations: editor.IModelDeltaDecoration[] = []
    const lineCount = Math.min(lines.length, model.getLineCount())
    for (let index = 0; index < lineCount; index += 1) {
      const line = lines[index]
      if (!line?.groupStart) {
        continue
      }
      let end = index
      while (end + 1 < lineCount && lines[end + 1] && !lines[end + 1]?.groupStart) {
        end += 1
      }
      decorations.push({
        range: {
          startLineNumber: index + 1,
          startColumn: 1,
          endLineNumber: end + 1,
          endColumn: model.getLineMaxColumn(end + 1)
        },
        options: {
          lineNumberHoverMessage: {
            value: line.commit
              ? `${formatGitAnnotateHover(line.commit)}\n\n_${hint}_`
              : uncommittedHover
          }
        }
      })
    }
    const collection = mountedEditor.createDecorationsCollection(decorations)
    return () => collection.clear()
  }, [lines, mountedEditor])

  // Click: an annotation opens its commit in the Git graph.
  useEffect(() => {
    if (!mountedEditor || !lines || !context) {
      return
    }
    // Why on release: leaving the tab mid-press would strand Monaco's line-selection drag.
    let pressed: { line: number; commitId: string } | null = null
    const down = mountedEditor.onMouseDown((event) => {
      const line = event.target.position?.lineNumber
      const commitId = event.target.element
        ?.closest(`[${GIT_ANNOTATE_COMMIT_ATTRIBUTE}]`)
        ?.getAttribute(GIT_ANNOTATE_COMMIT_ATTRIBUTE)
      const onAnnotation =
        event.target.type === GUTTER_LINE_NUMBERS_TARGET && event.event.leftButton
      pressed = onAnnotation && line && commitId ? { line, commitId } : null
    })
    // The release is matched by line: Monaco captures the pointer, so its element is not the cell.
    const up = mountedEditor.onMouseUp((event) => {
      const released = pressed
      pressed = null
      if (
        released &&
        event.target.type === GUTTER_LINE_NUMBERS_TARGET &&
        event.target.position?.lineNumber === released.line
      ) {
        openCommitInGitGraph(context.worktreeId, released.commitId)
      }
    })
    return () => {
      down.dispose()
      up.dispose()
    }
  }, [context, lines, mountedEditor])

  // The editor's own context menu and command palette; hidden where the host cannot answer.
  const offered = context !== null && !unsupported
  useEffect(() => {
    if (!mountedEditor || !offered) {
      return
    }
    const actions = [
      mountedEditor.addAction({
        id: 'orca.gitAnnotate.toggle',
        label: translate('gitAnnotate.toggle', 'Annotate with Git Blame'),
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 3,
        run: toggleAnnotations
      }),
      mountedEditor.addAction({
        id: 'orca.gitAnnotate.showSelectionHistory',
        label: translate('gitAnnotate.showSelectionHistory', 'Show History for Selection'),
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 4,
        run: (target) => {
          const selection = target.getSelection()
          if (!selection) {
            return
          }
          // A selection ending at column 1 does not include that last line.
          const endsBeforeLine =
            selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber
          showLineHistory(
            selection.startLineNumber,
            selection.endLineNumber - (endsBeforeLine ? 1 : 0)
          )
        }
      })
    ]
    return () => actions.forEach((action) => action.dispose())
  }, [mountedEditor, offered, showLineHistory, toggleAnnotations])

  const menu = useMemo<GitAnnotateMenu | null>(
    () =>
      context
        ? {
            annotated: annotated && !unsupported,
            disabledReason: unsupported
              ? translate(
                  'gitAnnotate.olderHost',
                  'This host runs an older Orca. Update it to annotate.'
                )
              : null,
            toggleAnnotations,
            showLineHistory
          }
        : null,
    [annotated, context, showLineHistory, toggleAnnotations, unsupported]
  )

  return {
    menu,
    lineNumbers: gutter?.render ?? null,
    lineNumbersMinChars: gutter?.minChars ?? null
  }
}
