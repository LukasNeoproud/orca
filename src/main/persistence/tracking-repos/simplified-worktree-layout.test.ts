import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { sanitizeRepoUpdatesForPersistence } from './repo-sanitization'
import { createRepoUpdateSchema } from '../../../shared/rpc-contract/repo-update-params'
import { z } from 'zod'

const schema = createRepoUpdateSchema({ repo: z.string() })

describe('project worktree layout preference', () => {
  it.each(['nested', 'flat'] as const)('retains an explicit %s preference', (layout) => {
    const updates = { simplifiedWorktreeLayout: layout, worktreeBasePath: '.worktrees' }
    expect(sanitizeRepoUpdatesForPersistence(updates)).toEqual(updates)
    expect(schema.parse({ repo: 'project', updates })).toEqual({ repo: 'project', updates })
  })

  it.each(['inside', 'orca-default', 'custom'] as const)(
    'retains the explicit %s location preset',
    (location) => {
      const updates = { simplifiedWorktreeLocation: location }
      expect(sanitizeRepoUpdatesForPersistence(updates)).toEqual(updates)
      expect(schema.parse({ repo: 'project', updates })).toEqual({ repo: 'project', updates })
    }
  )

  it('does not invent a preference for existing projects', () => {
    expect(sanitizeRepoUpdatesForPersistence({})).toEqual({})
    expect(schema.parse({ repo: 'project', updates: {} })).toEqual({ repo: 'project', updates: {} })
  })

  it('rejects malformed values at RPC and persistence boundaries', () => {
    const updates = { simplifiedWorktreeLayout: 'relocate' } as unknown as Partial<Repo>
    expect(sanitizeRepoUpdatesForPersistence(updates)).toEqual({})
    expect(schema.safeParse({ repo: 'project', updates }).success).toBe(false)
  })
})
