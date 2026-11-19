import { describe, expect, it } from 'vitest'
import { getVisibleRightSidebarActivityItems } from '../right-sidebar/right-sidebar-activity-visibility'
import { checksTabShowsQualityGates } from './checks-tab-quality-gates'

const gates = [{ id: 'lint', name: 'Lint', command: 'echo ok', required: true, timeoutSeconds: 60 }]

function visibleTabs(isFolder: boolean, showsGates: boolean): string[] {
  // The two git-only tabs as the activity bar declares them.
  return getVisibleRightSidebarActivityItems(
    [
      {
        id: 'source-control',
        icon: () => null,
        title: 'Source Control',
        shortcut: '',
        gitOnly: true
      },
      { id: 'checks', icon: () => null, title: 'Checks', shortcut: '', gitOnly: !showsGates }
    ],
    { isFolder, isFolderWorkspace: false, hasSshHost: false }
  ).map((item) => item.id)
}

describe('Checks tab for a workspace without git', () => {
  it('has gates to show only when the repository row carries a usable gate', () => {
    expect(checksTabShowsQualityGates(false, { qualityGates: gates })).toBe(true)
    expect(checksTabShowsQualityGates(false, { qualityGates: [] })).toBe(false)
    expect(checksTabShowsQualityGates(false, {})).toBe(false)
    expect(checksTabShowsQualityGates(false, null)).toBe(false)
  })

  it('has none for a folder workspace of a project group: no repository holds its gates', () => {
    expect(checksTabShowsQualityGates(true, { qualityGates: gates })).toBe(false)
  })

  it('keeps Checks for a folder with gates and hides it for a folder without', () => {
    expect(visibleTabs(true, true)).toEqual(['checks'])
    expect(visibleTabs(true, false)).toEqual([])
    expect(visibleTabs(false, false)).toEqual(['source-control', 'checks'])
  })
})
