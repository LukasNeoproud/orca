import { describe, expect, it } from 'vitest'
import {
  azureDevOpsReviewContentLines,
  trackAzureDevOpsReviewLines
} from './azure-devops-review-line-tracking'

const before = [
  'import a',
  'import b',
  '',
  'function run() {',
  '  const total = add(1, 2)',
  '  return total',
  '}'
]

describe('trackAzureDevOpsReviewLines', () => {
  it('keeps a line that nothing moved', () => {
    const after = [...before, '', 'export default run']
    expect(trackAzureDevOpsReviewLines(before, after, 5, 5)).toEqual({
      startLine: 5,
      endLine: 5,
      changed: false
    })
  })

  it('follows lines pushed down by insertions and pulled up by deletions', () => {
    const pushed = ['// header', '// more', ...before]
    expect(trackAzureDevOpsReviewLines(before, pushed, 5, 6)).toEqual({
      startLine: 7,
      endLine: 8,
      changed: false
    })
    const pulled = before.slice(2)
    expect(trackAzureDevOpsReviewLines(before, pulled, 5, 6)).toEqual({
      startLine: 3,
      endLine: 4,
      changed: false
    })
  })

  it('treats re-indented code as the same code', () => {
    const after = ['if (ready) {', ...before.map((line) => `    ${line}`), '}']
    expect(trackAzureDevOpsReviewLines(before, after, 5, 5)).toEqual({
      startLine: 6,
      endLine: 6,
      changed: false
    })
  })

  it('maps a rewritten line to its replacement and reports the change', () => {
    const after = [...before]
    after[4] = '  const total = sum([1, 2])'
    expect(trackAzureDevOpsReviewLines(before, after, 5, 5)).toEqual({
      startLine: 5,
      endLine: 5,
      changed: true
    })
  })

  it('keeps a rewritten line inside a shorter replacement block', () => {
    const after = ['import a', 'import b', '', 'const run = () => add(1, 2)']
    expect(trackAzureDevOpsReviewLines(before, after, 6, 6)).toEqual({
      startLine: 4,
      endLine: 4,
      changed: true
    })
  })

  it('returns null when the lines were removed without a replacement', () => {
    const after = before.filter((_, index) => index !== 4 && index !== 5)
    expect(trackAzureDevOpsReviewLines(before, after, 5, 6)).toBeNull()
  })

  it('keeps the surviving part of a range and reports the change', () => {
    const after = before.filter((_, index) => index !== 4)
    expect(trackAzureDevOpsReviewLines(before, after, 5, 6)).toEqual({
      startLine: 5,
      endLine: 5,
      changed: true
    })
  })

  it('reports a change when lines were inserted inside the range', () => {
    const after = [...before.slice(0, 5), '  log(total)', ...before.slice(5)]
    expect(trackAzureDevOpsReviewLines(before, after, 5, 6)).toEqual({
      startLine: 5,
      endLine: 7,
      changed: true
    })
  })

  it('follows code moved past other code, which a line diff reads as removed and added', () => {
    const helper = ['function add(a, b) {', '  return a + b', '}']
    const from = [...helper, '', ...before]
    const to = [...before, '', ...helper]
    expect(trackAzureDevOpsReviewLines(from, to, 1, 2)).toEqual({
      startLine: before.length + 2,
      endLine: before.length + 3,
      changed: false
    })
  })

  it('does not follow moved code it cannot tell apart', () => {
    // Two copies before, one after: the surviving copy may be the other one.
    const from = ['  log(total)', 'first()', '  log(total)', 'second()']
    const to = ['first()', 'second()', 'third()', '  log(total)']
    expect(trackAzureDevOpsReviewLines(from, to, 1, 1)).toBeNull()
    // A closing brace alone names no code.
    expect(
      trackAzureDevOpsReviewLines(['}', 'a()', 'b()'], ['a()', 'b()', 'c()', '}'], 1, 1)
    ).toBeNull()
  })

  it('returns null for lines past the end of the original file', () => {
    expect(trackAzureDevOpsReviewLines(before, before, 40, 41)).toBeNull()
    expect(trackAzureDevOpsReviewLines([], ['x'], 1, 1)).toBeNull()
  })

  it('tracks through a file too different to diff line by line', () => {
    const head = Array.from({ length: 3 }, (_, index) => `head ${index}`)
    const oldBody = Array.from({ length: 12_000 }, (_, index) => `old ${index}`)
    const newBody = Array.from({ length: 12_000 }, (_, index) => `new ${index}`)
    const tail = ['tail']
    const from = [...head, ...oldBody, ...tail]
    const to = [...head, ...newBody, 'extra', ...tail]
    expect(trackAzureDevOpsReviewLines(from, to, 2, 2)).toEqual({
      startLine: 2,
      endLine: 2,
      changed: false
    })
    expect(trackAzureDevOpsReviewLines(from, to, from.length, from.length)).toEqual({
      startLine: to.length,
      endLine: to.length,
      changed: false
    })
    expect(trackAzureDevOpsReviewLines(from, to, 10, 10)?.changed).toBe(true)
  })
})

describe('azureDevOpsReviewContentLines', () => {
  it('numbers lines across LF and CRLF endings', () => {
    expect(azureDevOpsReviewContentLines('a\r\nb\nc')).toEqual(['a', 'b', 'c'])
  })
})
