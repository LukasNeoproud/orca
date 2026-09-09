import { describe, expect, it } from 'vitest'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { buildWorktreeCardPresentation } from './worktree-card-presentation'
import type { WorktreeCardController } from './use-worktree-card-controller'

function presentation(overrides: Partial<WorktreeCardController> = {}) {
  return buildWorktreeCardPresentation({
    worktree: { displayName: 'Fixed label' },
    visibleCardTitle: 'Fixed label',
    branch: 'feature/changed',
    identityDisplay: 'feature/changed',
    detachedHeadDisplay: null,
    cardProps: [],
    workspacePorts: [],
    newCardStyle: false,
    compactCards: false,
    ...overrides
  } as WorktreeCardController)
}

describe('sidebar checkout identity', () => {
  it.each([
    { newCardStyle: true, compactCards: false },
    { newCardStyle: false, compactCards: false },
    { newCardStyle: false, compactCards: true }
  ])('shows a changed branch on a second line in %j', (style) => {
    const result = presentation(style)
    expect(result.hasMetaRow).toBe(true)
    expect(result.showIdentityInNewCard || result.showBranch).toBe(true)
    expect(result.showIdentityInNewCard && result.showBranch).toBe(false)
    expect(result.titleOnlyCard).toBe(false)
  })

  it.each([true, false])('does not repeat a matching branch (new style: %s)', (newCardStyle) => {
    const result = presentation({ newCardStyle, visibleCardTitle: 'feature/changed' })
    expect(result.showBranch).toBe(false)
    expect(result.showIdentityInNewCard).toBe(false)
  })

  it('keeps detached commit identity visible in compact cards', () => {
    const result = presentation({
      compactCards: true,
      branch: '',
      identityDisplay: undefined,
      detachedHeadDisplay: getWorktreeGitIdentityDisplay({
        head: 'abc1234'
      }) as WorktreeCardController['detachedHeadDisplay']
    })
    expect(result.showDetachedHeadInMetaRow).toBe(true)
    expect(result.hasMetaRow).toBe(true)
  })

  it('never gives a non-Git folder a branch line', () => {
    const result = presentation({ isFolder: true })
    expect(result.showBranch).toBe(false)
    expect(result.showDetachedHeadInMetaRow).toBe(false)
  })
})
