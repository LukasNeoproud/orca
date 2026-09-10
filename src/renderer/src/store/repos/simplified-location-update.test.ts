import { describe, expect, it } from 'vitest'
import { sanitizeRepoUpdate } from './repo-update'

describe('explicit project location over JSON RPC', () => {
  it('transmits a clear for a saved Orca default instead of omitting the old custom root', () => {
    const wire = JSON.parse(
      JSON.stringify(
        sanitizeRepoUpdate({
          worktreeBasePath: '',
          simplifiedWorktreeLocation: 'orca-default',
          simplifiedWorktreeLayout: 'nested'
        })
      )
    )
    expect(wire).toMatchObject({ worktreeBasePath: '', simplifiedWorktreeLocation: 'orca-default' })
  })
})
