// Finds a served module's import specifiers: the string literal after `from`, `import` or
// `import(` in code, skipping strings, comments, template text and regex literals so text that
// merely reads like an import is left alone. A light scanner, not a parser: the CLI serves
// compiled output, and a misread only ever makes a specifier unloadable, never loadable.

/** One literal specifier; `value` is null when its spelling is not plain enough to read. */
export type ClaudeModsClientSpecifier = { start: number; end: number; value: string | null }

/** Words after which a `/` starts a regex literal rather than a division. */
const EXPRESSION_WORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await'
])
/** Words whose parenthesised condition is followed by a statement, which a regex can start. */
const CONDITION_WORDS = new Set(['if', 'while', 'for', 'with'])
/** Stands for the `)` closing such a condition. */
const CONDITION_END = ')if'
const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^'
const WORD_START = /[A-Za-z_$\u0080-￿]/
const WORD_PART = /[\w$\u0080-￿]/

function regexAllowed(last: string): boolean {
  return (
    last === '' ||
    last === '}' ||
    last === CONDITION_END ||
    (last.length === 1 && REGEX_AFTER.includes(last)) ||
    EXPRESSION_WORDS.has(last)
  )
}

/** The end of a quoted literal starting at `start`, just past its closing quote. */
function skipQuoted(source: string, start: number): number {
  const quote = source[start]
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i]
    if (char === '\\') {
      i += 1
    } else if (char === quote || char === '\n') {
      return i + 1
    }
  }
  return source.length
}

/** Template text from `start` up to its closing backtick, or `open` just past a `${`. */
function skipTemplate(source: string, start: number): { end: number; open: boolean } {
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (char === '\\') {
      i += 1
    } else if (char === '`') {
      return { end: i + 1, open: false }
    } else if (char === '$' && source[i + 1] === '{') {
      return { end: i + 2, open: true }
    }
  }
  return { end: source.length, open: false }
}

function skipRegex(source: string, start: number): number {
  let inClass = false
  let i = start + 1
  for (; i < source.length; i += 1) {
    const char = source[i]
    if (char === '\\') {
      i += 1
    } else if (char === '[') {
      inClass = true
    } else if (char === ']') {
      inClass = false
    } else if (char === '\n') {
      return i
    } else if (char === '/' && !inClass) {
      i += 1
      break
    }
  }
  while (i < source.length && WORD_PART.test(source[i] ?? '')) {
    i += 1
  }
  return i
}

/** A literal's text; escapes are read only where JSON reads them the same way. */
function readLiteral(raw: string): string | null {
  if (raw.length < 2 || raw.at(-1) !== raw[0]) {
    return null
  }
  const inner = raw.slice(1, -1)
  if (!inner.includes('\\')) {
    return inner
  }
  if (raw[0] !== '"') {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export function findClaudeModsClientSpecifiers(source: string): ClaudeModsClientSpecifier[] {
  const found: ClaudeModsClientSpecifier[] = []
  // Brace depth at each open `${`, so its closing `}` resumes the template text.
  const templates: number[] = []
  let depth = 0
  let last = ''
  let lastMember = false
  // Whether each open `(` follows if/while/for/with.
  const parens: boolean[] = []
  // 'import': a literal or `(` may follow; 'literal': the next literal is a specifier.
  let expect: 'import' | 'literal' | null = null
  const literal = (start: number, end: number): void => {
    if (expect !== null) {
      found.push({ start, end, value: readLiteral(source.slice(start, end)) })
    }
    expect = null
    last = '"'
  }
  let i = 0
  while (i < source.length) {
    const char = source[i] ?? ''
    if (/\s/.test(char)) {
      i += 1
    } else if (char === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
    } else if (char === '"' || char === "'") {
      const end = skipQuoted(source, i)
      literal(i, end)
      i = end
    } else if (char === '`' || (char === '}' && templates.at(-1) === depth - 1)) {
      if (char === '}') {
        templates.pop()
        depth -= 1
      }
      const scan = skipTemplate(source, i + 1)
      if (scan.open) {
        templates.push(depth)
        depth += 1
        expect = null
        last = '{'
      } else if (char === '`') {
        literal(i, scan.end)
      } else {
        expect = null
        last = '"'
      }
      i = scan.end
    } else if (char === '/' && regexAllowed(last)) {
      i = skipRegex(source, i)
      expect = null
      last = '"'
    } else if (WORD_START.test(char)) {
      let end = i + 1
      while (end < source.length && WORD_PART.test(source[end] ?? '')) {
        end += 1
      }
      const word = source.slice(i, end)
      const member = last === '.'
      expect = member ? null : word === 'import' ? 'import' : word === 'from' ? 'literal' : null
      last = word
      lastMember = member
      i = end
    } else if (/\d/.test(char)) {
      while (i < source.length && /[\w.]/.test(source[i] ?? '')) {
        i += 1
      }
      expect = null
      last = '0'
    } else {
      expect = char === '(' && expect === 'import' ? 'literal' : null
      depth += char === '{' ? 1 : char === '}' ? -1 : 0
      if (char === '(') {
        parens.push(CONDITION_WORDS.has(last) && !lastMember)
      }
      // `++` and `--` end an operand, so a `/` after them divides.
      const step = (char === '+' || char === '-') && source[i + 1] === char
      last = char === ')' && parens.pop() === true ? CONDITION_END : step ? char + char : char
      i += step ? 2 : 1
    }
  }
  return found
}
