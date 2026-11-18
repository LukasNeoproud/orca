import { useEffect, useState } from 'react'
import type { editor } from 'monaco-editor'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getRuntimeGitBlame,
  isGitAnnotateUnsupportedHostError
} from '@/runtime/runtime-git-annotate-client'
import { useAppStore } from '@/store'
import type { GitBlameResult } from '../../../../shared/git-blame'
import type { GitAnnotateFileContext } from './git-annotate-file-context'
import { mapGitBlameToLines, type GitAnnotatedLine } from './git-annotate-line-map'
import { useGitAnnotateStore } from './git-annotate-store'

/** How long a clean buffer may differ from the blamed text before it is annotated again. */
const EXTERNAL_CHANGE_SETTLE_MS = 400

type BlameSnapshot = { modelUri: string; lines: string[]; blame: GitBlameResult }

function sameLines(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index])
}

/** A path with no committed version: every line Git would annotate is uncommitted. */
function uncommittedBlame(lines: readonly string[]): GitBlameResult {
  const lineCount = lines.at(-1) === '' ? lines.length - 1 : lines.length
  return {
    status: 'ready',
    commits: [],
    lineCount,
    ranges: lineCount > 0 ? [{ startLine: 1, lineCount, commitId: null }] : []
  }
}

/**
 * Annotations for the editor's current text, or null while off or loading. Git annotates the
 * text once; edits after that are followed locally, and a save or a new HEAD asks Git again.
 */
export function useGitAnnotateLines({
  mountedEditor,
  modelUri,
  fileId,
  context,
  annotated
}: {
  mountedEditor: editor.ICodeEditor | null
  modelUri: string
  fileId: string
  context: GitAnnotateFileContext | null
  annotated: boolean
}): (GitAnnotatedLine | null)[] | null {
  const [snapshot, setSnapshot] = useState<BlameSnapshot | null>(null)
  const [lines, setLines] = useState<(GitAnnotatedLine | null)[] | null>(null)
  const [refreshRequest, setRefreshRequest] = useState(0)
  const isDirty = useAppStore(
    (state) => state.openFiles.find((file) => file.id === fileId)?.isDirty ?? false
  )
  const head = useAppStore((state) => {
    const worktreeId = context?.worktreeId
    return worktreeId ? (state.getKnownWorktreeById(worktreeId)?.head ?? null) : null
  })
  const active = annotated && context !== null && mountedEditor !== null

  useEffect(() => {
    if (!active || !mountedEditor || !context) {
      return
    }
    const model = mountedEditor.getModel()
    if (!model) {
      return
    }
    let cancelled = false
    const blamedLines = model.getLinesContent()
    const stop = (): void => useGitAnnotateStore.getState().setAnnotated(modelUri, false)
    getRuntimeGitBlame(context.gitContext, {
      relativePath: context.relativePath,
      contents: model.getValue()
    })
      .then((blame) => {
        if (cancelled) {
          return
        }
        if (blame.status === 'too-large') {
          toast.info(translate('gitAnnotate.tooLarge', 'This file is too large to annotate.'))
          stop()
          return
        }
        setSnapshot({
          modelUri,
          lines: blamedLines,
          blame: blame.status === 'untracked' ? uncommittedBlame(blamedLines) : blame
        })
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        stop()
        if (isGitAnnotateUnsupportedHostError(error)) {
          // The disabled action explains the older host; no error to report.
          useGitAnnotateStore.getState().setHostSupport(context.hostKey, 'unsupported')
          return
        }
        toast.error(translate('gitAnnotate.failed', 'Could not load Git annotations'), {
          description: error instanceof Error ? error.message : String(error)
        })
      })
    return () => {
      cancelled = true
    }
    // Why isDirty and head: a save or a commit changes what Git says about the same text.
  }, [active, context, head, isDirty, modelUri, mountedEditor, refreshRequest])

  useEffect(() => {
    const model = mountedEditor?.getModel()
    if (!active || !model || snapshot?.modelUri !== modelUri) {
      setLines(null)
      return
    }
    let settleTimer: ReturnType<typeof setTimeout> | null = null
    const remap = (): void => {
      setLines(mapGitBlameToLines(snapshot.blame, snapshot.lines, model.getLinesContent()))
    }
    remap()
    const subscription = model.onDidChangeContent(() => {
      remap()
      if (settleTimer !== null) {
        clearTimeout(settleTimer)
      }
      // A clean buffer that no longer matches the blamed text was reloaded from disk.
      settleTimer = setTimeout(() => {
        settleTimer = null
        const file = useAppStore.getState().openFiles.find((entry) => entry.id === fileId)
        if (file && !file.isDirty && !sameLines(snapshot.lines, model.getLinesContent())) {
          setRefreshRequest((request) => request + 1)
        }
      }, EXTERNAL_CHANGE_SETTLE_MS)
    })
    return () => {
      subscription.dispose()
      if (settleTimer !== null) {
        clearTimeout(settleTimer)
      }
    }
  }, [active, fileId, modelUri, mountedEditor, snapshot])

  return active ? lines : null
}
