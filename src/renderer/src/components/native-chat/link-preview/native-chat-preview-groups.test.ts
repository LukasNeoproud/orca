import { describe, expect, it } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'

const context: RuntimeFileOperationArgs = {
  target: { kind: 'local' },
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

describe('chat preview target resolution', () => {
  it('resolves relative and absolute file links with line targets', () => {
    expect(resolveChatPreviewTarget('src/main.ts:12', context)).toMatchObject({
      path: '/repo/worktree/src/main.ts',
      line: 12,
      kind: 'file'
    })
    expect(resolveChatPreviewTarget('/repo/worktree/docs/guide.md:7', context)).toMatchObject({
      path: '/repo/worktree/docs/guide.md',
      line: 7,
      kind: 'file'
    })
    expect(resolveChatPreviewTarget('config.yaml#L4', context)).toMatchObject({
      path: '/repo/worktree/config.yaml',
      line: 4,
      kind: 'file'
    })
  })

  it('normalizes Windows absolute paths', () => {
    const windows: RuntimeFileOperationArgs = { ...context, worktreePath: 'C:\\repo\\worktree' }
    expect(resolveChatPreviewTarget('C:\\repo\\worktree\\src\\main.ts:9', windows)).toMatchObject({
      path: 'C:/repo/worktree/src/main.ts',
      line: 9
    })
  })

  it('accepts valid web URLs and rejects malformed URLs or unsupported schemes', () => {
    expect(resolveChatPreviewTarget('https://example.com/guide')).toMatchObject({ kind: 'web' })
    expect(resolveChatPreviewTarget('https://%')).toBeNull()
    expect(resolveChatPreviewTarget('javascript:alert(1)')).toBeNull()
    expect(resolveChatPreviewTarget('src/main.ts')).toBeNull()
  })
})
