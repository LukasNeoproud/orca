import { describe, expect, it } from 'vitest'
import { findClaudeModsClientSpecifiers } from './claude-mods-client-specifiers'

const values = (source: string): (string | null)[] =>
  findClaudeModsClientSpecifiers(source).map((specifier) => specifier.value)

describe('findClaudeModsClientSpecifiers', () => {
  it('finds static, bare and dynamic specifiers', () => {
    expect(values('import a from "./a.js"; import "./b.js"; export * from "./c.js"')).toEqual([
      './a.js',
      './b.js',
      './c.js'
    ])
    expect(values('const m = await import("./x.js")')).toEqual(['./x.js'])
  })

  it('reads a / after a postfix ++ or -- as division', () => {
    expect(values('let v = a++ / 2; import("./x.js")')).toEqual(['./x.js'])
    expect(values('let v = a-- / 2 / 3; import("./x.js")')).toEqual(['./x.js'])
    expect(values('let v = b + +c / 2; import("./x.js")')).toEqual(['./x.js'])
  })

  it('reads a / after an if, while, for or with condition as a regex', () => {
    expect(values('if (a) /"/.test(s); import("./x.js")')).toEqual(['./x.js'])
    expect(values('while (a(b)) /"/.test(s); import("./x.js")')).toEqual(['./x.js'])
    expect(values('for (;;) /"/.test(s); import("./x.js")')).toEqual(['./x.js'])
  })

  it('reads a / after any other ) as division', () => {
    expect(values('let v = (a + b) / 2; import("./x.js")')).toEqual(['./x.js'])
    expect(values('let v = f(a) / 2 / 3; import("./x.js")')).toEqual(['./x.js'])
    expect(values('let v = a.if(b) / 2; import("./x.js")')).toEqual(['./x.js'])
  })

  it('leaves text that merely reads like an import alone', () => {
    expect(values('const s = "import(\\"./no.js\\")"; // import "./no.js"')).toEqual([])
    expect(values('const r = /import "x"/; const t = `from "./no.js"`')).toEqual([])
    expect(values('x = a / b; y = /"/g; import("./x.js")')).toEqual(['./x.js'])
  })
})
