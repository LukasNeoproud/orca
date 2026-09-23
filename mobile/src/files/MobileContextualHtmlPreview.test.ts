import { describe, expect, it } from 'vitest'
import {
  isolatedMobileContextualHtml,
  shouldLoadMobileContextualHtmlUrl
} from './mobile-contextual-html-policy'

describe('MobileContextualHtmlPreview', () => {
  it('prepends a restrictive CSP before untrusted content', () => {
    const isolated = isolatedMobileContextualHtml('<script>fetch("https://x")</script>')

    expect(isolated.indexOf('Content-Security-Policy')).toBeLessThan(isolated.indexOf('<script>'))
    expect(isolated).toContain("default-src 'none'")
    expect(isolated).toContain("connect-src 'none'")
    expect(isolated).toContain("form-action 'none'")
  })

  it('allows only the isolated inline document to navigate', () => {
    expect(shouldLoadMobileContextualHtmlUrl('about:blank')).toBe(true)
    expect(shouldLoadMobileContextualHtmlUrl('data:text/plain,ok')).toBe(false)
    expect(shouldLoadMobileContextualHtmlUrl('https://example.com')).toBe(false)
    expect(shouldLoadMobileContextualHtmlUrl('file:///tmp/secret')).toBe(false)
  })
})
