import { describe, expect, it } from 'vitest'
import type { Element, Root } from 'hast'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { chatPreviewHrefs, rehypeChatPreviewGroups } from './rehype-chat-preview-groups'

const context: RuntimeFileOperationArgs = {
  target: { kind: 'local' },
  worktreeId: 'worktree-1',
  worktreePath: '/repo/worktree'
}

function element(tagName: string, children: Element[] = [], href?: string): Element {
  return { type: 'element', tagName, properties: href ? { href } : {}, children }
}

describe('rehype chat preview groups', () => {
  it('collects heading and list links once per response after sanitization', () => {
    const heading = element('h2', [element('a', [], 'src/main.ts#L4')])
    const list = element('ul', [
      element('li', [element('a', [], 'src/main.ts#L10')]),
      element('li', [element('a', [], 'docs/guide.md')])
    ])
    const paragraph = element('p', [element('a', [], 'docs/guide.md')])
    const tree: Root = { type: 'root', children: [heading, list, paragraph] }

    rehypeChatPreviewGroups(context)()(tree)

    expect(chatPreviewHrefs(heading)).toEqual(['src/main.ts#L4'])
    expect(chatPreviewHrefs(list)).toEqual(['docs/guide.md'])
    expect(chatPreviewHrefs(paragraph)).toEqual([])
  })

  it('excludes links inside code and ignores malformed or unsupported URLs', () => {
    const code = element('pre', [element('a', [], 'src/main.ts')])
    const paragraph = element('p', [
      element('a', [], 'javascript:alert(1)'),
      element('a', [], 'https://example.com/guide')
    ])
    const tree: Root = { type: 'root', children: [code, paragraph] }

    rehypeChatPreviewGroups(context)()(tree)

    expect(chatPreviewHrefs(code)).toEqual([])
    expect(chatPreviewHrefs(paragraph)).toEqual(['https://example.com/guide'])
  })
})
