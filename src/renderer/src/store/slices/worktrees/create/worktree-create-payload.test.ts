import { describe, expect, it } from 'vitest'
import {
  buildLocalWorktreeCreateArgs,
  buildRuntimeWorktreeCreateParams
} from './worktree-create-payload'

describe('checkout recovery opt-in transport', () => {
  it.each([buildLocalWorktreeCreateArgs, buildRuntimeWorktreeCreateParams])(
    'forwards opt-in only from recovery-aware callers',
    (build) => {
      const request = { repoId: 'repo', name: 'feature/topic' }
      const attempt = { name: request.name }
      expect(build(request, attempt)).not.toHaveProperty('recoverCompletedCheckoutFailure')
      expect(
        build({ ...request, options: { recoverCompletedCheckoutFailure: true } }, attempt)
      ).toHaveProperty('recoverCompletedCheckoutFailure', true)
    }
  )
})
