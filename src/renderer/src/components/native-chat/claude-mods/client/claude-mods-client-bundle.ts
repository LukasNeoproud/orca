// A plugin's surface modules as `ui_client_module` serves them, read defensively and split at
// the import specifiers the CLI wrote as string literals, so the worker only joins text with
// the blob URLs it made itself. Every other specifier (`surface-unlinked:///…`, a computed
// import, a bare name) stays as written and fails to load inside the worker.

/** One piece of a module's source: verbatim text, or the import of another served file. */
export type ClaudeModsClientPart = string | { link: string }

export type ClaudeModsClientFile = { key: string; parts: ClaudeModsClientPart[] }

export type ClaudeModsClientLimits = {
  nodes: number
  depth: number
  chars: number
  values: number
  dataDepth: number
}

export type ClaudeModsClientEntry = { module: string; entry: string; component: string }

export type ClaudeModsClientBundle = {
  plugin: string
  hash: string
  modules: ClaudeModsClientEntry[]
  runtime: string
  limits: ClaudeModsClientLimits
  files: ClaudeModsClientFile[]
}

/** The terminal's own bounds, used where an answer leaves one out. */
export const CLAUDE_MODS_CLIENT_DEFAULT_LIMITS: ClaudeModsClientLimits = {
  nodes: 20_000,
  depth: 32,
  chars: 100_000,
  values: 20_000,
  dataDepth: 32
}

/** The CLI's own caps (1 MiB a file, 8 MiB in all, 512 files): a larger answer is not its. */
const MAX_FILE_CHARS = 1024 * 1024
const MAX_TOTAL_CHARS = 8 * 1024 * 1024
const MAX_FILES = 512

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function readLimits(value: unknown): ClaudeModsClientLimits {
  const raw = isRecord(value) ? value : {}
  const base = CLAUDE_MODS_CLIENT_DEFAULT_LIMITS
  return {
    nodes: readLimit(raw.nodes, base.nodes),
    depth: readLimit(raw.depth, base.depth),
    chars: readLimit(raw.chars, base.chars),
    values: readLimit(raw.values, base.values),
    dataDepth: readLimit(raw.dataDepth, base.dataDepth)
  }
}

function readEntries(value: unknown): ClaudeModsClientEntry[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) =>
    isRecord(entry) &&
    typeof entry.module === 'string' &&
    typeof entry.entry === 'string' &&
    typeof entry.component === 'string'
      ? [{ module: entry.module, entry: entry.entry, component: entry.component }]
      : []
  )
}

/** A served file's import specifiers, each a JSON string literal after `from` or `import`. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)("(?:[^"\\\n]|\\.)*")/g

function readLiteral(literal: string): string | null {
  try {
    const value: unknown = JSON.parse(literal)
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/** Splits `source` at every literal specifier naming one of `keys`; the rest stays text. */
export function splitClaudeModsClientSource(
  source: string,
  keys: ReadonlySet<string>
): ClaudeModsClientPart[] {
  const parts: ClaudeModsClientPart[] = []
  let last = 0
  for (const match of source.matchAll(SPECIFIER)) {
    const [, lead = '', literal = ''] = match
    const key = readLiteral(literal)
    if (key === null || !keys.has(key)) {
      continue
    }
    const start = (match.index ?? 0) + lead.length
    parts.push(source.slice(last, start), { link: key })
    last = start + literal.length
  }
  parts.push(source.slice(last))
  return parts.filter((part) => part !== '')
}

/**
 * Files in an order where each comes after everything it links, so a blob URL exists before
 * the text that names it. Null for a cycle: blob URLs cannot name each other.
 */
export function orderClaudeModsClientFiles(
  files: ClaudeModsClientFile[]
): ClaudeModsClientFile[] | null {
  const byKey = new Map(files.map((file) => [file.key, file]))
  const done = new Set<string>()
  const visiting = new Set<string>()
  const ordered: ClaudeModsClientFile[] = []
  const visit = (file: ClaudeModsClientFile): boolean => {
    if (done.has(file.key)) {
      return true
    }
    if (visiting.has(file.key)) {
      return false
    }
    visiting.add(file.key)
    for (const part of file.parts) {
      const linked = typeof part === 'string' ? undefined : byKey.get(part.link)
      if (linked && !visit(linked)) {
        return false
      }
    }
    visiting.delete(file.key)
    done.add(file.key)
    ordered.push(file)
    return true
  }
  return files.every(visit) ? ordered : null
}

export type ClaudeModsClientBundleResult =
  | { ok: true; bundle: ClaudeModsClientBundle }
  | { ok: false; reason: string }

/** One `ui_client_module` answer as a bundle the worker can load, or why it cannot. */
export function readClaudeModsClientBundle(answer: unknown): ClaudeModsClientBundleResult {
  if (!isRecord(answer) || typeof answer.plugin !== 'string' || typeof answer.hash !== 'string') {
    return { ok: false, reason: 'the surface modules came back malformed' }
  }
  const runtime = typeof answer.runtime === 'string' ? answer.runtime : ''
  const rawFiles = Array.isArray(answer.files) ? answer.files : []
  if (rawFiles.length > MAX_FILES) {
    return { ok: false, reason: `the surface modules hold more than ${MAX_FILES} files` }
  }
  const sources = new Map<string, string>()
  let total = 0
  for (const file of rawFiles) {
    if (!isRecord(file) || typeof file.key !== 'string' || typeof file.source !== 'string') {
      return { ok: false, reason: 'a surface module file came back malformed' }
    }
    total += file.source.length
    if (file.source.length > MAX_FILE_CHARS || total > MAX_TOTAL_CHARS) {
      return { ok: false, reason: 'the surface modules are larger than Claude Code serves' }
    }
    if (!sources.has(file.key)) {
      sources.set(file.key, file.source)
    }
  }
  if (!sources.has(runtime)) {
    return { ok: false, reason: 'the surface modules carry no runtime' }
  }
  const keys = new Set(sources.keys())
  const files = [...sources].map(([key, source]) => ({
    key,
    parts: splitClaudeModsClientSource(source, keys)
  }))
  const ordered = orderClaudeModsClientFiles(files)
  if (!ordered) {
    return { ok: false, reason: 'the surface modules import each other in a cycle' }
  }
  return {
    ok: true,
    bundle: {
      plugin: answer.plugin,
      hash: answer.hash,
      modules: readEntries(answer.modules),
      runtime,
      limits: readLimits(answer.limits),
      files: ordered
    }
  }
}
