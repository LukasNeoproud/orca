// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  activeModal: 'new-workspace-composer' as string | null,
  modalData: { initialRepoId: 'repo', prefilledName: 'feature/task' },
  closeModal: vi.fn(),
  settings: { experimentalSimplifiedCreateWorktree: false },
  isGit: true,
  selectionKind: null as string | null,
  selectedBaseBranch: undefined as string | undefined,
  formOptions: vi.fn(),
  composerOptions: vi.fn(),
  submit: vi.fn(),
  validate: vi.fn().mockResolvedValue(null)
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
vi.mock('@/hooks/useComposerState', () => ({
  useComposerState: (options: unknown) => {
    state.composerOptions(options)
    return {
      cardProps: {
        selectedRepoIsGit: state.isGit,
        repoId: 'repo',
        name: 'feature/task',
        smartNameSelection: state.selectionKind ? { kind: state.selectionKind } : null,
        projectOptions: [],
        detectedAgentIds: [],
        onSmartGitHubItemSelect: vi.fn()
      },
      composerRef: { current: null },
      nameInputRef: { current: null },
      submitQuick: state.submit,
      selectedBaseBranch: state.selectedBaseBranch,
      createDisabled: false
    }
  }
}))
vi.mock('./new-workspace/use-simplified-worktree-form', () => ({
  useSimplifiedWorktreeForm: (options: unknown) => {
    state.formOptions(options)
    return { validate: state.validate, disabled: false }
  }
}))
vi.mock('./new-workspace/SimplifiedWorktreeFields', () => ({
  SimplifiedWorktreeFields: () => <div data-simplified-fields="" />
}))
vi.mock('@/components/NewWorkspaceComposerCard', () => ({
  default: ({
    simplifiedFields,
    onCreate,
    createDisabled
  }: {
    simplifiedFields?: ReactNode
    onCreate: () => void
    createDisabled: boolean
  }) => (
    <div>
      {simplifiedFields ?? <div data-original-fields="" />}
      <button disabled={createDisabled} onClick={onCreate}>
        Create
      </button>
    </div>
  )
}))
vi.mock('@/components/agent/AgentSettingsDialog', () => ({ default: () => null }))
vi.mock('@/components/ui/dialog', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    Dialog: Container,
    DialogContent: Container,
    DialogDescription: Container,
    DialogHeader: Container,
    DialogTitle: Container
  }
})
import NewWorkspaceComposerModal from './NewWorkspaceComposerModal'

let root: Root
let container: HTMLDivElement
async function render() {
  await act(async () => {
    root.render(<NewWorkspaceComposerModal />)
  })
}
beforeEach(() => {
  state.activeModal = 'new-workspace-composer'
  state.settings.experimentalSimplifiedCreateWorktree = false
  state.isGit = true
  state.selectionKind = null
  state.selectedBaseBranch = undefined
  state.validate.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('quick worktree dialog preference', () => {
  it.each([false, true])('captures preference %s until the next launch', async (enabled) => {
    state.settings.experimentalSimplifiedCreateWorktree = enabled
    await render()
    expect(Boolean(container.querySelector('[data-simplified-fields]'))).toBe(enabled)
    state.settings.experimentalSimplifiedCreateWorktree = !enabled
    await render()
    expect(Boolean(container.querySelector('[data-simplified-fields]'))).toBe(enabled)
    state.activeModal = null
    await render()
    state.activeModal = 'new-workspace-composer'
    await render()
    expect(Boolean(container.querySelector('[data-simplified-fields]'))).toBe(!enabled)
  })

  it.each(['github-pr', 'gitlab-mr'])(
    'uses the resolved base of a %s picked after launch',
    async (kind) => {
      state.settings.experimentalSimplifiedCreateWorktree = true
      await render()
      state.selectionKind = kind
      await render()
      state.selectedBaseBranch = 'refs/remotes/origin/review-head'
      await render()
      expect(state.formOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          initialBaseBranch: 'refs/remotes/origin/review-head'
        })
      )
    }
  )

  it('blocks submission while a newly linked review is resolving its head', async () => {
    state.settings.experimentalSimplifiedCreateWorktree = true
    state.selectionKind = 'gitlab-mr'
    await render()
    const button = container.querySelector('button')!
    expect(button.disabled).toBe(true)
    await act(async () => button.click())
    expect(state.validate).not.toHaveBeenCalled()
    state.selectedBaseBranch = 'refs/remotes/origin/mr-head'
    await render()
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    expect(state.validate).toHaveBeenCalledOnce()
  })

  it('retains the non-Git form when the preference is enabled', async () => {
    state.settings.experimentalSimplifiedCreateWorktree = true
    state.isGit = false
    await render()
    expect(container.querySelector('[data-original-fields]')).not.toBeNull()
    expect(container.querySelector('[data-simplified-fields]')).toBeNull()
  })

  it('keeps launch project and prefilled name in the reusable composer', async () => {
    state.settings.experimentalSimplifiedCreateWorktree = true
    await render()
    expect(state.composerOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialName: 'feature/task',
        initialRepoId: 'repo',
        persistDraft: false
      })
    )
  })
})
