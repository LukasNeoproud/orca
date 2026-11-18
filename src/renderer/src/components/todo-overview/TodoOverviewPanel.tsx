import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import type { SearchFileResult, SearchMatch } from '../../../../shared/code-search-types'
import { buildSearchRows } from '../right-sidebar/search-rows'
import { cancelRevealFrame, openMatchResult } from '../right-sidebar/search-match-open'
import { SearchResultsPane } from '../right-sidebar/SearchResultsPane'
import {
  TODO_COMMENT_QUERY,
  TODO_OVERVIEW_MAX_RESULTS
} from '../../../../shared/todo-comment-search'
import type { TodoOverview } from './use-todo-overview'

const EMPTY_COLLAPSED: ReadonlySet<string> = new Set()

function ChangedOnlyFilter({ todo }: { todo: TodoOverview }): React.JSX.Element | null {
  const changedFiles = todo.changedFiles
  if (!changedFiles) {
    return null
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-xs text-foreground">
        <Checkbox
          checked={todo.changedOnly}
          onCheckedChange={(checked) => todo.setChangedOnly(checked === true)}
        />
        {translate('todoOverview.changedOnly', 'Only files changed on this branch')}
      </label>
      {todo.changedOnly ? (
        <p className="text-2xs text-muted-foreground">
          {changedFiles.baseRef
            ? translate(
                'todoOverview.againstBase',
                'Changes against {{value0}} plus uncommitted changes.',
                { value0: changedFiles.baseRef }
              )
            : translate(
                'todoOverview.uncommittedOnly',
                'No comparison with the branch base is loaded, so only uncommitted changes count.'
              )}
        </p>
      ) : null}
      {todo.changedOnly && !changedFiles.baseRef ? (
        <div>
          <Button type="button" variant="outline" size="xs" onClick={todo.openSourceControl}>
            {translate('todoOverview.openSourceControl', 'Compare in Source Control')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function emptyMessage(todo: TodoOverview): string {
  if (todo.changedOnly && todo.changedFiles?.paths.length === 0) {
    return translate('todoOverview.noChangedFiles', 'No changed files.')
  }
  return todo.changedOnly
    ? translate('todoOverview.emptyChanged', 'No TODO or FIXME comments in changed files.')
    : translate('todoOverview.empty', 'No TODO or FIXME comments.')
}

/** TODO and FIXME comments of the whole workspace, grouped by file, in the Contents view body. */
export function TodoOverviewPanel({ todo }: { todo: TodoOverview }): React.JSX.Element {
  const openFile = useAppStore((s) => s.openFile)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(EMPTY_COLLAPSED)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
  const { results, owner, loading, error } = todo.state
  const rows = useMemo(() => buildSearchRows(results, collapsed), [results, collapsed])

  useEffect(
    () => () => {
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    },
    []
  )

  const toggleCollapsed = useCallback((filePath: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(filePath)) {
        next.add(filePath)
      }
      return next
    })
  }, [])

  const handleMatchClick = useCallback(
    (fileResult: SearchFileResult, match: SearchMatch) => {
      openMatchResult({
        resultOwner: owner,
        fileResult,
        match,
        openFile,
        setPendingEditorReveal,
        revealRafRef,
        revealInnerRafRef
      })
    },
    [owner, openFile, setPendingEditorReveal]
  )

  const isEmpty = !error && !loading && results !== null && results.files.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="todo-overview-panel">
      <div className="flex flex-col gap-1 border-b border-border px-2 py-1.5 empty:hidden">
        <ChangedOnlyFilter todo={todo} />
        {results?.truncated ? (
          <p role="status" className="text-2xs text-muted-foreground">
            {translate(
              'todoOverview.truncated',
              'Showing the first {{value0}} comments; the rest are left out.',
              { value0: TODO_OVERVIEW_MAX_RESULTS }
            )}
          </p>
        ) : null}
      </div>
      {isEmpty ? (
        <div className="flex h-32 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {emptyMessage(todo)}
        </div>
      ) : (
        <SearchResultsPane
          results={results}
          error={error}
          hasCommittedResults
          query={TODO_COMMENT_QUERY}
          loading={loading}
          rows={rows}
          scrollRef={scrollRef}
          onToggleCollapsedFile={toggleCollapsed}
          onMatchClick={handleMatchClick}
        />
      )}
    </div>
  )
}
