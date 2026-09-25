import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const terminalCss = fs.readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

describe('terminal container geometry', () => {
  it('fits below continuation and title bars without reserving link tooltip height', () => {
    expect(terminalCss).toMatch(
      /\.xterm-container\s*{[^}]*--orca-pane-content-top:\s*max\(\s*var\(--pane-padding-y, 4px\),\s*var\(--orca-pane-continuation-height, 0px\)\s*\);/s
    )
    expect(terminalCss).toMatch(
      /\.pane\[data-has-title\] \.xterm-container\s*{[^}]*--orca-pane-content-top:\s*calc\(\s*var\(--orca-pane-title-height\) \+ var\(--orca-pane-continuation-height, 0px\)\s*\);/s
    )
    expect(terminalCss).toContain('height: calc(100% - var(--orca-pane-content-top));')
    expect(terminalCss).toMatch(
      /\.pane-link-tooltip\s*{[^}]*height:\s*var\(--orca-terminal-link-tooltip-height\);/s
    )
  })
})
