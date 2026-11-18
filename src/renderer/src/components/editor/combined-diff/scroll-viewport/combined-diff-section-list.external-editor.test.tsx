// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { DiffSection } from '../../diff-section-types'
import type { DiffSectionItemProps } from '../../diff-section-item-props'
import { CombinedDiffSectionList } from './combined-diff-section-list'

const itemProps = vi.hoisted((): { current: DiffSectionItemProps[] } => ({ current: [] }))

vi.mock('../../DiffSectionItem', () => ({
  DiffSectionItem: (props: DiffSectionItemProps) => {
    itemProps.current.push(props)
    return null
  }
}))
vi.mock('../../DiffNotesSendMenu', () => ({ DiffNotesSendMenu: () => null }))

afterEach(() => {
  cleanup()
  itemProps.current = []
})

function section(path: string): DiffSection {
  return {
    key: path,
    path,
    status: 'modified',
    originalContent: '',
    modifiedContent: '',
    collapsed: false,
    loading: false,
    dirty: false,
    diffResult: null,
    largeDiffRenderLimit: null
  }
}

describe('CombinedDiffSectionList Open in', () => {
  it('hands each section its file inside the workspace of the combined diff', () => {
    const sections = [section('src/App.kt')]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the list reads only these virtualizer members.
    const virtualizer = {
      getTotalSize: () => 0,
      getVirtualItems: () => [{ index: 0, key: 0, start: 0 }],
      measureElement: () => {}
    } as unknown as Virtualizer<HTMLDivElement, Element>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the list reads only filePath and worktreeId of a combined diff tab.
    const file = {
      filePath: '/work/repo',
      worktreeId: 'repo-1::/work/repo',
      externalSshTargetId: 'ssh-1'
    } as OpenFile
    render(
      <CombinedDiffSectionList
        activeGroupId={undefined}
        canOpenWorkspaceFileBrowserForPath={() => false}
        diffCommentsForWorktree={[]}
        file={file}
        handleSectionSaveRef={{ current: async () => {} }}
        isAllMode
        isBranchMode={false}
        isCommitMode={false}
        isDark={false}
        loadSection={vi.fn()}
        loadDeferredSection={vi.fn()}
        markDirectScrollInput={vi.fn()}
        modifiedEditorsRef={{ current: new Map() }}
        onScrollbarPointerDown={vi.fn()}
        openSection={vi.fn()}
        openSectionPreview={vi.fn()}
        retrySection={vi.fn()}
        scrollThumb={{ visible: false, top: 0, height: 0 }}
        sectionHeights={{}}
        sections={sections}
        setScrollContainerRef={vi.fn()}
        setSectionHeights={vi.fn()}
        setSections={vi.fn()}
        settings={null}
        sideBySide={false}
        skippedConflictNotice={null}
        toggleSection={vi.fn()}
        virtualizer={virtualizer}
      />
    )

    const props = itemProps.current.at(-1)
    expect(props?.getExternalEditorFile?.(sections[0])).toEqual({
      file: {
        filePath: '/work/repo/src/App.kt',
        worktreeId: 'repo-1::/work/repo',
        runtimeEnvironmentId: undefined,
        externalSshTargetId: 'ssh-1'
      }
    })
  })
})
