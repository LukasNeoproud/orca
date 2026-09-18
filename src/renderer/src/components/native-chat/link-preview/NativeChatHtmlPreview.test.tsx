// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import NativeChatHtmlPreview from './NativeChatHtmlPreview'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

afterEach(cleanup)

describe('HTML file preview', () => {
  it('defers loading and isolates the document without network access', () => {
    const html =
      '<meta http-equiv="refresh" content="0;url=https://example.com"><h1>Hello</h1><script>fetch("https://example.com")</script>'
    render(<NativeChatHtmlPreview content={html} filePath="page.html" />)
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show preview' }))
    const frame = screen.getByTitle('Isolated HTML preview') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.srcdoc).toContain("default-src 'none'")
    expect(frame.srcdoc).toContain("connect-src 'none'")
    expect(frame.srcdoc).toContain('<h1>Hello</h1>')
    expect(frame.srcdoc).not.toContain('http-equiv="refresh"')
  })
})
