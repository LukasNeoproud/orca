import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { APP_MENU_VIEW_ITEMS } from './app-menu-views'
import {
  RightSidebarTabParam,
  STATIC_RIGHT_SIDEBAR_TABS,
  UiUpdate
} from './rpc-contract/client-ui-params'

// The tabs a paired client built before the local gates section validates against. A tab outside
// this list makes such a client refuse the whole right sidebar layout.
const TABS_OF_AN_OLDER_CLIENT = [
  'explorer',
  'search',
  'vault',
  'workspaces',
  'pr-checks',
  'backlog',
  'source-control',
  'checks',
  'ports',
  'pull-requests'
] as const
const olderClientLayout = z.object({
  rightSidebarOpen: z.boolean().optional(),
  rightSidebarTab: z.enum(TABS_OF_AN_OLDER_CLIENT).optional()
})

describe('right sidebar layout with the local gates section', () => {
  it('adds no tab: the local gates live inside Checks', () => {
    expect([...STATIC_RIGHT_SIDEBAR_TABS]).toEqual([...TABS_OF_AN_OLDER_CLIENT])
  })

  it('lets an older paired client load every layout this build can publish', () => {
    for (const rightSidebarTab of STATIC_RIGHT_SIDEBAR_TABS) {
      expect(
        olderClientLayout.safeParse({ rightSidebarOpen: true, rightSidebarTab }).success,
        rightSidebarTab
      ).toBe(true)
    }
  })

  it('opens the gates from the menu on a tab an older client already knows', () => {
    const item = APP_MENU_VIEW_ITEMS.find((candidate) => candidate.id === 'quality-gates')
    expect(item?.target).toEqual({
      kind: 'right-sidebar-tab',
      tab: 'checks',
      requires: 'git-or-quality-gates'
    })
    for (const { target } of APP_MENU_VIEW_ITEMS) {
      if (target.kind === 'right-sidebar-tab') {
        expect(olderClientLayout.shape.rightSidebarTab.safeParse(target.tab).success).toBe(true)
      }
    }
  })

  it('still reads the layout an older client sends', () => {
    for (const rightSidebarTab of TABS_OF_AN_OLDER_CLIENT) {
      expect(RightSidebarTabParam.safeParse(rightSidebarTab).success).toBe(true)
      expect(UiUpdate.safeParse({ rightSidebarOpen: true, rightSidebarTab }).success).toBe(true)
    }
  })
})
