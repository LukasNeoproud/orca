import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

describe('continuation execution boundary', () => {
  it.each([
    { executionHostId: 'ssh:remote', wslDistro: null },
    { executionHostId: 'local', wslDistro: 'Ubuntu' }
  ])(
    'refuses unsupported host $executionHostId / $wslDistro before reading local files',
    async (location) => {
      const runtime = new OrcaRuntimeService({ getSettings: () => ({}) } as never)
      const internal = runtime as unknown as {
        resolveStructuredAgentSessionLocation: () => Promise<unknown>
        resolveRuntimeFileTarget: () => Promise<unknown>
      }
      internal.resolveStructuredAgentSessionLocation = vi.fn(async () => location)
      internal.resolveRuntimeFileTarget = vi.fn()
      await expect(
        runtime.resolveConversationContinuationSource({
          providerSessionId: 'thread',
          workspaceId: 'workspace'
        })
      ).rejects.toThrow('owning host runtime')
      expect(internal.resolveRuntimeFileTarget).not.toHaveBeenCalled()
    }
  )
})
