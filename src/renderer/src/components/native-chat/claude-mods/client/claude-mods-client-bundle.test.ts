import { describe, expect, it } from 'vitest'
import {
  CLAUDE_MODS_CLIENT_DEFAULT_LIMITS,
  orderClaudeModsClientFiles,
  readClaudeModsClientBundle,
  splitClaudeModsClientSource,
  unlinkedClaudeModsClientSpecifier
} from './claude-mods-client-bundle'

// The board module as Claude Code 2.1.299 served it in a real ui_client_module answer.
const BOARD_SOURCE =
  'import { label } from "surface:///hooks/label.js";\nexport default function Board(props, surface) {\n  return h(surface.elements.Text, {}, label(props.title));\n}\n'

describe('splitClaudeModsClientSource', () => {
  it('links every served specifier and keeps everything else as text', () => {
    const keys = new Set(['surface:///hooks/label.js', 'claude:hooks-types'])
    const source = [
      'import { label } from "surface:///hooks/label.js";',
      'import { atom } from "claude:hooks-types";',
      'export * from "surface:///hooks/label.js";',
      'import "surface:///hooks/label.js";',
      'const lazy = () => import("surface:///hooks/label.js");',
      'import lodash from "surface-unlinked:///lodash";',
      'const computed = import(("surface-unlinked:///computed#" + String(name)));',
      'const text = "from nowhere";'
    ].join('\n')
    const parts = splitClaudeModsClientSource(source, keys)
    expect(parts.filter((part) => typeof part !== 'string')).toEqual([
      { link: 'surface:///hooks/label.js' },
      { link: 'claude:hooks-types' },
      { link: 'surface:///hooks/label.js' },
      { link: 'surface:///hooks/label.js' },
      { link: 'surface:///hooks/label.js' }
    ])
    const text = parts.map((part) => (typeof part === 'string' ? part : '<URL>')).join('')
    expect(text).toContain('import { label } from <URL>;')
    expect(text).toContain('import(<URL>)')
    expect(text).toContain(
      `from ${JSON.stringify(unlinkedClaudeModsClientSpecifier('surface-unlinked:///lodash'))}`
    )
    expect(text).toContain('import(("surface-unlinked:///computed#" + String(name)))')
    expect(text).toContain('const text = "from nowhere";')
  })

  it('makes every literal specifier that names no served file unloadable', () => {
    const source = [
      `import a from 'https://example.com/a.js';`,
      'import b from "data:text/javascript,export default 1";',
      'const c = import(`blob:null/abc`);',
      "export * from 'https://example.com/\\x62.js';",
      'import "./relative.js";'
    ].join('\n')
    const text = splitClaudeModsClientSource(source, new Set()).join('')
    expect(text).not.toMatch(/(from|import\(?)\s*["'`](https|data|blob|\.)/)
    for (const spelled of [
      'https://example.com/a.js',
      'data:text/javascript,export default 1',
      'blob:null/abc',
      "'https://example.com/\\x62.js'",
      './relative.js'
    ]) {
      expect(text).toContain(JSON.stringify(unlinkedClaudeModsClientSpecifier(spelled)))
    }
  })

  it('leaves text that only reads like an import alone', () => {
    const source = [
      `const a = 'loaded from "https://x"';`,
      'const b = `import "https://y"`;',
      '// import c from "https://z"',
      'const d = /from "x"/.test(s) ? Array.from("abc") : obj.import("q");',
      'const e = { from: "w", import: "v" };'
    ].join('\n')
    expect(splitClaudeModsClientSource(source, new Set())).toEqual([source])
  })

  it('reads a specifier spelled with JSON escapes', () => {
    const parts = splitClaudeModsClientSource(
      'import a from "surface:///a\\u0062.js"',
      new Set(['surface:///ab.js'])
    )
    expect(parts).toEqual(['import a from ', { link: 'surface:///ab.js' }])
  })
})

describe('orderClaudeModsClientFiles', () => {
  it('puts each file after what it links', () => {
    const ordered = orderClaudeModsClientFiles([
      { key: 'a', parts: ['x', { link: 'b' }] },
      { key: 'b', parts: [{ link: 'c' }] },
      { key: 'c', parts: ['leaf'] }
    ])
    expect(ordered?.map((file) => file.key)).toEqual(['c', 'b', 'a'])
  })

  it('refuses a cycle', () => {
    expect(
      orderClaudeModsClientFiles([
        { key: 'a', parts: [{ link: 'b' }] },
        { key: 'b', parts: [{ link: 'a' }] }
      ])
    ).toBeNull()
  })
})

describe('readClaudeModsClientBundle', () => {
  const answer = {
    plugin: 'board',
    hash: 'abc',
    modules: [
      { module: 'hooks/board.jsx', entry: 'surface:///hooks/board.jsx', component: 'default' },
      { module: 1 }
    ],
    runtime: 'claude:surface-runtime',
    limits: { nodes: 100, depth: 'deep' },
    files: [
      { key: 'claude:surface-runtime', source: 'export const install = () => {}' },
      { key: 'surface:///hooks/board.jsx', source: BOARD_SOURCE },
      { key: 'surface:///hooks/label.js', source: "export const label = (s) => 'L:' + s\n" }
    ]
  }

  it('reads modules, limits and files in link order', () => {
    const read = readClaudeModsClientBundle(answer)
    expect(read.ok).toBe(true)
    if (!read.ok) {
      return
    }
    expect(read.bundle.modules).toEqual([answer.modules[0]])
    expect(read.bundle.limits).toEqual({ ...CLAUDE_MODS_CLIENT_DEFAULT_LIMITS, nodes: 100 })
    expect(read.bundle.files.map((file) => file.key)).toEqual([
      'claude:surface-runtime',
      'surface:///hooks/label.js',
      'surface:///hooks/board.jsx'
    ])
  })

  it('refuses an answer without a runtime or with malformed files', () => {
    expect(readClaudeModsClientBundle({ ...answer, runtime: 'missing' }).ok).toBe(false)
    expect(readClaudeModsClientBundle({ ...answer, files: [{ key: 1 }] }).ok).toBe(false)
    expect(readClaudeModsClientBundle(null).ok).toBe(false)
  })
})
