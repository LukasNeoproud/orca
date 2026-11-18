import { describe, expect, it } from 'vitest'
import {
  computeGitAnnotateGutterLayout,
  formatGitAnnotateHover,
  renderGitAnnotateGutterLine
} from './git-annotate-gutter-html'
import type { GitAnnotatedLine } from './git-annotate-line-map'

const commit = {
  id: 'a'.repeat(40),
  displayId: 'aaaaaaa',
  author: 'Ada <b>Baker</b>',
  timestamp: new Date(2001, 0, 2, 12).getTime(),
  subject: 'Use [sea] *salt*'
}
const start: GitAnnotatedLine = { commit, groupStart: true }
const lines = [start, { commit, groupStart: false }, { commit: null, groupStart: true }, null]

describe('git annotate gutter', () => {
  it('sizes the gutter for the widest annotation plus the line number', () => {
    expect(computeGitAnnotateGutterLayout(lines, 'Uncommitted')).toEqual({
      authorChars: 16,
      minChars: 7 + 1 + 10 + 1 + 16 + 2 + 3
    })
    expect(computeGitAnnotateGutterLayout([lines[2]!], 'Uncommitted').minChars).toBe(11 + 2 + 3)
  })

  it('shows hash, date and author on the first line of a group only, escaped', () => {
    const layout = computeGitAnnotateGutterLayout(lines, 'Uncommitted')
    const first = renderGitAnnotateGutterLine(start, 7, layout, 'Uncommitted')
    expect(first).toContain('aaaaaaa 2001-01-02 Ada &lt;b&gt;Baker&lt;/b&gt;')
    expect(first).toContain('orca-git-annotate-group-start')
    expect(first).toContain(`data-git-annotate-commit="${commit.id}"`)
    expect(first).toContain('<span>7</span>')

    const second = renderGitAnnotateGutterLine(lines[1]!, 8, layout, 'Uncommitted')
    expect(second).not.toContain('Ada')
    // Still carries the commit, so the whole group opens it.
    expect(second).toContain(`data-git-annotate-commit="${commit.id}"`)
  })

  it('labels uncommitted lines and leaves unannotated lines with their number', () => {
    const layout = computeGitAnnotateGutterLayout(lines, 'Uncommitted')
    const uncommitted = renderGitAnnotateGutterLine(lines[2]!, 9, layout, 'Uncommitted')
    expect(uncommitted).toContain('>Uncommitted</span>')
    expect(uncommitted).not.toContain('data-git-annotate-commit')
    expect(renderGitAnnotateGutterLine(null, 10, layout, 'Uncommitted')).toBe(
      '<span class="orca-git-annotate-row"><span></span><span>10</span></span>'
    )
  })

  it('clips a long author to the column width', () => {
    const long = {
      commit: { ...commit, author: 'A very long author name indeed' },
      groupStart: true
    }
    const layout = computeGitAnnotateGutterLayout([long], 'Uncommitted')
    expect(renderGitAnnotateGutterLine(long, 1, layout, 'Uncommitted')).toContain(
      'A very long aut…<'
    )
  })

  it('escapes markdown in the hover', () => {
    expect(formatGitAnnotateHover(commit)).toContain('**Use \\[sea\\] \\*salt\\***')
    expect(formatGitAnnotateHover(commit)).toContain('Ada \\<b\\>Baker\\</b\\>')
  })
})
