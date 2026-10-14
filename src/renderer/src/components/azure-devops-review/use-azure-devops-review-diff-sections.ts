import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { removeDiffSectionMeasuredHeight } from '@/components/editor/diff-section-height-cache'
import type { DiffSection } from '@/components/editor/diff-section-types'
import type { GitBranchChangeEntry } from '../../../../shared/git-diff-compare-types'
import type { AzureDevOpsReviewChange } from '../../../../shared/azure-devops-review-types'
import {
  azureDevOpsLoadedSectionFields,
  azureDevOpsPendingSection
} from './azure-devops-review-diff-sections'
import { loadAzureDevOpsReviewFileDiff } from './use-azure-devops-review-file-diff'

/** One lazily loaded diff section per changed file, for the all-changes view. */
export function useAzureDevOpsReviewDiffSections({
  pullRequestKey,
  iterationId,
  entries,
  entrySignature,
  changeByPath,
  setSectionHeights
}: {
  pullRequestKey: string
  iterationId: number | null
  entries: readonly GitBranchChangeEntry[]
  entrySignature: string
  changeByPath: ReadonlyMap<string, AzureDevOpsReviewChange>
  setSectionHeights: (updater: (prev: Record<number, number>) => Record<number, number>) => void
}): {
  sections: DiffSection[]
  setSections: React.Dispatch<React.SetStateAction<DiffSection[]>>
  loadSection: (index: number) => void
  retrySection: (index: number) => void
  toggleSection: (index: number) => void
  setAllSectionsCollapsed: (collapsed: boolean) => void
} {
  const [sections, setSections] = useState<DiffSection[]>([])
  const sectionsRef = useRef<DiffSection[]>([])
  const requestedRef = useRef<Set<number>>(new Set())
  const generationRef = useRef(0)
  useLayoutEffect(() => {
    sectionsRef.current = sections
  })

  useEffect(() => {
    // Why: a new iteration or file list makes in-flight loads stale; the generation drops them.
    generationRef.current += 1
    requestedRef.current = new Set()
    setSections(entries.map(azureDevOpsPendingSection))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySignature])

  const loadSection = useCallback(
    (index: number) => {
      const section = sectionsRef.current[index]
      const change = section ? changeByPath.get(section.path) : undefined
      if (!section || !change || section.collapsed || requestedRef.current.has(index)) {
        return
      }
      requestedRef.current.add(index)
      const generation = generationRef.current
      const patch = (fields: Partial<DiffSection>): void => {
        if (generationRef.current !== generation) {
          return
        }
        setSections((prev) =>
          prev.map((current, currentIndex) =>
            currentIndex === index ? { ...current, ...fields } : current
          )
        )
      }
      loadAzureDevOpsReviewFileDiff(pullRequestKey, iterationId, change)
        .then((diff) => patch({ ...azureDevOpsLoadedSectionFields(diff), error: undefined }))
        .catch((error: unknown) =>
          patch({ loading: false, error: error instanceof Error ? error.message : String(error) })
        )
    },
    [changeByPath, iterationId, pullRequestKey]
  )

  const retrySection = useCallback(
    (index: number) => {
      requestedRef.current.delete(index)
      setSectionHeights((prev) => removeDiffSectionMeasuredHeight(prev, index))
      setSections((prev) =>
        prev.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, loading: true, error: undefined } : section
        )
      )
      loadSection(index)
    },
    [loadSection, setSectionHeights]
  )

  const toggleSection = useCallback(
    (index: number) => {
      const expanding = sectionsRef.current[index]?.collapsed ?? false
      setSections((prev) =>
        prev.map((section, sectionIndex) =>
          sectionIndex === index ? { ...section, collapsed: !section.collapsed } : section
        )
      )
      if (expanding) {
        window.requestAnimationFrame(() => loadSection(index))
      }
    },
    [loadSection]
  )

  const setAllSectionsCollapsed = useCallback(
    (collapsed: boolean) => {
      setSections((prev) => prev.map((section) => ({ ...section, collapsed })))
      if (!collapsed) {
        window.requestAnimationFrame(() => {
          sectionsRef.current.forEach((_, index) => loadSection(index))
        })
      }
    },
    [loadSection]
  )

  return {
    sections,
    setSections,
    loadSection,
    retrySection,
    toggleSection,
    setAllSectionsCollapsed
  }
}
