import { FileJson, GitGraph } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { editorTabFileIcon } from './editor-tab-file-icon'

describe('editorTabFileIcon', () => {
  it('shows the git graph icon for a git graph tab, whatever its path', () => {
    expect(editorTabFileIcon({ mode: 'git-graph', filePath: '/repo/package.json' })).toBe(GitGraph)
  })

  it('shows the file type icon for any other tab', () => {
    expect(editorTabFileIcon({ mode: 'edit', filePath: '/repo/data.json' })).toBe(FileJson)
  })
})
