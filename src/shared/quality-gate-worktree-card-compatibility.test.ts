import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { UiUpdate, WorktreeCardProperties } from './rpc-contract/client-ui-params'
import {
  COMPACT_WORKTREE_CARD_PROPERTIES,
  DEFAULT_WORKTREE_CARD_PROPERTIES,
  WORKTREE_CARD_PROPERTIES
} from './worktree/card-properties'

// The card properties a paired client built before the gates glyph validates against. A property
// outside this list makes such a client refuse the whole card layout.
const PROPERTIES_OF_AN_OLDER_CLIENT = [
  'status',
  'unread',
  'ci',
  'branch',
  'issue',
  'linear-issue',
  'jira-issue',
  'pr',
  'automation',
  'cli',
  'comment',
  'ports',
  'inline-agents',
  'host'
] as const
const olderClientLayout = z.object({
  worktreeCardProperties: z.array(z.enum(PROPERTIES_OF_AN_OLDER_CLIENT)).optional()
})

describe('workspace card layout with the gates glyph', () => {
  it('adds no card property: the glyph follows the gates of the repository, not the layout', () => {
    expect([...WORKTREE_CARD_PROPERTIES]).toEqual([...PROPERTIES_OF_AN_OLDER_CLIENT])
  })

  it('lets an older paired client load every card layout this build can publish', () => {
    for (const worktreeCardProperties of [
      [...WORKTREE_CARD_PROPERTIES],
      DEFAULT_WORKTREE_CARD_PROPERTIES,
      COMPACT_WORKTREE_CARD_PROPERTIES,
      WorktreeCardProperties.parse([])
    ]) {
      expect(olderClientLayout.safeParse({ worktreeCardProperties }).success).toBe(true)
    }
  })

  it('still reads the card layout an older client sends', () => {
    const update = UiUpdate.safeParse({
      worktreeCardProperties: [...PROPERTIES_OF_AN_OLDER_CLIENT]
    })
    expect(update.success).toBe(true)
    expect(update.data?.worktreeCardProperties).toEqual([...PROPERTIES_OF_AN_OLDER_CLIENT])
  })
})
