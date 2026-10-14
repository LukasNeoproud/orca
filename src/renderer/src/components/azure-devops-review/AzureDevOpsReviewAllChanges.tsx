import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { editor as monacoEditor } from 'monaco-editor'
import { toast } from 'sonner'
import { Columns2, ExternalLink, PanelLeftOpen, Rows2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { translate } from '@/i18n/i18n'
import { DiffSectionItem } from '@/components/editor/DiffSectionItem'
import { getDiffSectionRowEstimatedHeight } from '@/components/editor/diff-section-layout'
import type { DiffSection } from '@/components/editor/diff-section-types'
import { createAzureDevOpsReviewDraft } from '@/lib/azure-devops-review-client'
import { CombinedDiffFileTree } from '../editor/combined-diff/browse-files/combined-diff-file-tree'
import { handleCombinedDiffFileTreeNavigation } from '../editor/combined-diff/browse-files/combined-diff-file-tree-navigation'
import { useCombinedDiffSectionIndexMap } from '../editor/combined-diff/resolve-changes/use-combined-diff-section-index-map'
import type { CombinedDiffFileTreeEntry } from '../editor/combined-diff/resolve-changes/combined-diff-section-identity'
import { usePRFileSectionHeights } from '../pull-request-page/files/section-heights'
import { usePRFileActiveSection } from '../pull-request-page/files/active-section'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail
} from '../../../../shared/azure-devops-review-types'
import { useAzureDevOpsReviewDiffSections } from './use-azure-devops-review-diff-sections'
import { useAzureDevOpsReviewInlineComments } from './use-azure-devops-review-inline-comments'
import { AzureDevOpsReviewIconButton } from './AzureDevOpsReviewIconButton'

const OVERSCAN = 5
const NO_VIEWED = new Set<string>()

/**
 * Azure DevOps-style "all changes" view: every changed file in one scroll, each showing only
 * the changed lines with a little context, and threads and drafts under their lines.
 */
export function AzureDevOpsReviewAllChanges({
  detail,
  entries,
  changeByPath,
  repoPath,
  viewModeToggle,
  onChanged
}: {
  detail: AzureDevOpsReviewDetail
  entries: readonly GitBranchChangeEntry[]
  changeByPath: ReadonlyMap<string, AzureDevOpsReviewChange>
  repoPath: string
  viewModeToggle: ReactNode
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const isDark = useDocumentDarkTheme()
  const pullRequestKey = detail.pullRequest.key
  const iterationId = detail.latestIteration?.id ?? null
  const entrySignature = useMemo(
    () =>
      JSON.stringify({
        pullRequestKey,
        iterationId,
        entries: entries.map((entry) => [entry.path, entry.oldPath ?? null, entry.status])
      }),
    [entries, iterationId, pullRequestKey]
  )
  const [sectionHeights, setSectionHeights] = usePRFileSectionHeights(entrySignature)
  const [activeSectionKey, setActiveSectionKey] = usePRFileActiveSection(entrySignature)
  const [sideBySide, setSideBySide] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const {
    sections,
    setSections,
    loadSection,
    retrySection,
    toggleSection,
    setAllSectionsCollapsed
  } = useAzureDevOpsReviewDiffSections({
    pullRequestKey,
    iterationId,
    entries,
    entrySignature,
    changeByPath,
    setSectionHeights
  })
  const inline = useAzureDevOpsReviewInlineComments(detail, onChanged)
  const sectionIndexByKey = useCombinedDiffSectionIndexMap({ entrySignature, sections })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<DiffSection[]>([])
  const modifiedEditorsRef = useRef<Map<number, monacoEditor.IStandaloneCodeEditor>>(new Map())
  // Why: review diffs are read-only, so the section save hook never runs.
  const handleSectionSaveRef = useRef<(index: number) => Promise<void>>(async () => {})
  useLayoutEffect(() => {
    sectionsRef.current = sections
  })
  const allCollapsed = sections.length > 0 && sections.every((section) => section.collapsed)

  const virtualizer = useVirtualizer({
    count: sections.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const section = sections[index]
      return section ? getDiffSectionRowEstimatedHeight(section, sectionHeights[index]) : 88
    },
    overscan: OVERSCAN,
    getItemKey: (index) => {
      const section = sections[index]
      return section ? `${section.key}:${section.collapsed ? 'c' : 'e'}` : index
    }
  })

  useLayoutEffect(() => {
    virtualizer.measure()
  }, [sideBySide, virtualizer])

  const handleTreeNavigate = useCallback(
    (entry: CombinedDiffFileTreeEntry) => {
      const index = handleCombinedDiffFileTreeNavigation({
        mode: 'commit',
        entry,
        sections: sectionsRef.current,
        sectionIndexByKey,
        toggleSection,
        scrollToIndex: (target) => virtualizer.scrollToIndex(target, { align: 'start' })
      })
      if (index !== null) {
        setActiveSectionKey(sectionsRef.current[index]?.key ?? null)
      }
    },
    [sectionIndexByKey, setActiveSectionKey, toggleSection, virtualizer]
  )

  const openSection = useCallback(
    (index: number) => {
      const path = sectionsRef.current[index]?.path
      if (path) {
        void window.api.shell.openUrl(
          `${detail.pullRequest.webUrl}?_a=files&path=${encodeURIComponent(`/${path}`)}`
        )
      }
    },
    [detail.pullRequest.webUrl]
  )

  const handleAddLineComment = useCallback(
    async (
      section: DiffSection,
      { lineNumber, startLine, body }: { lineNumber: number; startLine?: number; body: string }
    ): Promise<boolean> => {
      try {
        await createAzureDevOpsReviewDraft({
          pullRequestKey,
          kind: 'inline',
          body,
          filePath: section.path,
          anchor: { side: 'right', startLine: startLine ?? lineNumber, endLine: lineNumber }
        })
        await onChanged()
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return false
      }
    },
    [onChanged, pullRequestKey]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
        {treeCollapsed ? (
          <AzureDevOpsReviewIconButton
            label={translate('azureDevOpsReview.showFiles', 'Show files')}
            onClick={() => setTreeCollapsed(false)}
          >
            <PanelLeftOpen className="size-3.5" />
          </AzureDevOpsReviewIconButton>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {translate('azureDevOpsReview.allChangesCount', '{{value0}} changed files', {
            value0: entries.length
          })}
        </span>
        <Button variant="ghost" size="xs" onClick={() => setAllSectionsCollapsed(!allCollapsed)}>
          {allCollapsed
            ? translate('azureDevOpsReview.expandAll', 'Expand all')
            : translate('azureDevOpsReview.collapseAll', 'Collapse all')}
        </Button>
        {viewModeToggle}
        <AzureDevOpsReviewIconButton
          label={
            sideBySide
              ? translate('azureDevOpsReview.inlineView', 'Inline view')
              : translate('azureDevOpsReview.sideBySideView', 'Side-by-side view')
          }
          onClick={() => setSideBySide((value) => !value)}
        >
          {sideBySide ? <Rows2 className="size-3.5" /> : <Columns2 className="size-3.5" />}
        </AzureDevOpsReviewIconButton>
        <AzureDevOpsReviewIconButton
          label={translate('azureDevOpsReview.openInBrowser', 'Open in Azure DevOps')}
          onClick={() => void window.api.shell.openUrl(`${detail.pullRequest.webUrl}?_a=files`)}
        >
          <ExternalLink className="size-3.5" />
        </AzureDevOpsReviewIconButton>
      </div>
      <div className="flex min-h-0 flex-1">
        <CombinedDiffFileTree
          mode="commit"
          worktreePath={repoPath}
          entries={entries}
          sectionIndexByKey={sectionIndexByKey}
          activeSectionKey={
            activeSectionKey && sectionIndexByKey.has(activeSectionKey) ? activeSectionKey : null
          }
          viewedSectionKeys={NO_VIEWED}
          collapsed={treeCollapsed}
          onCollapsedChange={setTreeCollapsed}
          onNavigate={handleTreeNavigate}
        />
        <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-auto scrollbar-editor">
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const section = sections[item.index]
              if (!section) {
                return null
              }
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 w-full"
                  style={{ top: `${item.start}px` }}
                >
                  <DiffSectionItem
                    section={section}
                    index={item.index}
                    isBranchMode={false}
                    sideBySide={sideBySide}
                    isDark={isDark}
                    settings={settings}
                    sectionHeight={sectionHeights[item.index]}
                    worktreeId={inline.scope}
                    inlineComments={inline.comments}
                    inlineCommentActions={inline.actions}
                    loadSection={loadSection}
                    retrySection={retrySection}
                    toggleSection={toggleSection}
                    openSection={openSection}
                    openSectionTitle={translate(
                      'azureDevOpsReview.openInBrowser',
                      'Open in Azure DevOps'
                    )}
                    onAddLineComment={handleAddLineComment}
                    addLineCommentLabel={translate(
                      'azureDevOpsReview.addDraft',
                      'Add draft comment'
                    )}
                    addLineCommentPlaceholder={translate(
                      'azureDevOpsReview.draftPlaceholder',
                      'Write a comment (Markdown)'
                    )}
                    setSectionHeights={setSectionHeights}
                    setSections={setSections}
                    modifiedEditorsRef={modifiedEditorsRef}
                    handleSectionSaveRef={handleSectionSaveRef}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
