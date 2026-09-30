// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { readResponseCommentSelection } from './response-comment-selection'

function selectionBetween(anchorNode: Node, focusNode: Node, quote: string): Selection {
  return {
    anchorNode,
    focusNode,
    isCollapsed: false,
    rangeCount: 1,
    toString: () => quote,
    getRangeAt: () =>
      ({
        getBoundingClientRect: () => ({
          left: 12,
          top: 20,
          right: 72,
          bottom: 36,
          width: 60,
          height: 16
        })
      }) as Range
  } as unknown as Selection
}

describe('response comment DOM selection', () => {
  it('captures nested code text verbatim from one response', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<article data-response-comment-selectable="true"><pre><code>  const answer = 42</code></pre></article>'
    const code = root.querySelector('code')!.firstChild!

    expect(
      readResponseCommentSelection(root, selectionBetween(code, code, '  const answer = 42\n'))
    ).toEqual({
      quote: '  const answer = 42\n',
      rect: { left: 12, top: 20, right: 72, bottom: 36, width: 60, height: 16 }
    })
  })

  it('rejects selection outside a response or across response rows', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<article data-response-comment-selectable="true"><span>first</span></article>',
      '<article data-response-comment-selectable="true"><span>second</span></article>',
      '<p>composer or user text</p>'
    ].join('')
    const responseNodes = root.querySelectorAll('span')
    const outside = root.querySelector('p')!.firstChild!

    expect(
      readResponseCommentSelection(root, selectionBetween(outside, outside, 'user'))
    ).toBeNull()
    expect(
      readResponseCommentSelection(
        root,
        selectionBetween(responseNodes[0].firstChild!, responseNodes[1].firstChild!, 'first second')
      )
    ).toBeNull()
  })

  it('rejects collapsed and whitespace-only selections', () => {
    const root = document.createElement('div')
    root.innerHTML = '<article data-response-comment-selectable="true">answer</article>'
    const node = root.firstChild!.firstChild!
    const whitespace = selectionBetween(node, node, '   ')
    expect(readResponseCommentSelection(root, whitespace)).toBeNull()
    expect(
      readResponseCommentSelection(root, { ...whitespace, isCollapsed: true } as Selection)
    ).toBeNull()
  })
})
