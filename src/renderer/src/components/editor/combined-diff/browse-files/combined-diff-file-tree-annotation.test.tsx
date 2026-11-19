// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { CombinedDiffFileTreeEntry } from '../resolve-changes/combined-diff-section-identity'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ combinedDiffFileTreeWidth: 420, setCombinedDiffFileTreeWidth: () => {} })
}))

const { CombinedDiffFileTree } = await import('./combined-diff-file-tree')

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const ENTRIES: GitBranchChangeEntry[] = [
  { path: 'src/app/main.ts', status: 'modified' },
  { path: 'src/app/view.ts', status: 'added' },
  { path: 'README.md', status: 'modified' }
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function renderTree(renderFileAnnotation?: (entry: CombinedDiffFileTreeEntry) => ReactNode): void {
  act(() => {
    root.render(
      <CombinedDiffFileTree
        mode="branch"
        worktreePath="/repo"
        entries={ENTRIES}
        sectionIndexByKey={new Map()}
        activeSectionKey={null}
        viewedSectionKeys={new Set()}
        collapsed={false}
        onCollapsedChange={() => {}}
        onNavigate={() => {}}
        renderFileAnnotation={renderFileAnnotation}
      />
    )
  })
}

describe('CombinedDiffFileTree file annotation', () => {
  it('renders the same markup without an annotation as with one that renders nothing', () => {
    renderTree()
    const withoutAnnotation = host.innerHTML
    renderTree(() => null)
    expect(host.innerHTML).toBe(withoutAnnotation)
  })

  it('places the annotation on each file row it returns content for, never on a directory', () => {
    renderTree((entry) =>
      entry.path.startsWith('src/') ? <span data-testid="annotation">{entry.path}</span> : null
    )
    const annotations = Array.from(host.querySelectorAll('[data-testid="annotation"]'))
    expect(annotations.map((node) => node.textContent)).toEqual([
      'src/app/main.ts',
      'src/app/view.ts'
    ])
    for (const node of annotations) {
      expect(node.closest('button')?.getAttribute('aria-expanded')).toBeNull()
    }
  })
})
