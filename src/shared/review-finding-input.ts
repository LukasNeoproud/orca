import {
  isReviewCommandRunSource,
  REVIEW_COMMAND_RUN_ID_PATTERN,
  REVIEW_COMMAND_RUN_KIND,
  REVIEW_COMMAND_RUN_SOURCES,
  type ReviewCommandRunEvidence
} from './review-command-run-evidence'
import {
  isReviewFindingSeverity,
  REVIEW_CODE_CITATION_KIND,
  REVIEW_EVIDENCE_HOST_ONLY_FIELDS,
  REVIEW_FINDING_SEVERITIES,
  type ReviewCodeCitation,
  type ReviewFindingEvidence,
  type ReviewFindingSeverity,
  type ReviewUnknownEvidence
} from './review-finding'

// Why bounded: severity and evidence arrive from agents and other clients and are stored as sent.
export const REVIEW_FINDING_LIMITS = {
  evidenceItems: 10,
  pathChars: 1024,
  citedLines: 400,
  quoteChars: 4000,
  noteChars: 500,
  kindChars: 64,
  unknownEvidenceChars: 4000
} as const

/** An error names the field and the rule, so whoever sent the value can correct it. */
export type ReviewFindingInput<T> = { ok: true; value: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseReviewFindingSeverity(
  input: unknown
): ReviewFindingInput<ReviewFindingSeverity> {
  return isReviewFindingSeverity(input)
    ? { ok: true, value: input }
    : fail(`severity must be one of ${REVIEW_FINDING_SEVERITIES.join(', ')}`)
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

/** A path inside the repository: no leading slash, no step out of it, nothing a URL could misread. */
function parseRepositoryPath(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null
  }
  const path = input.trim().replace(/^\/+/, '')
  const valid =
    path.length > 0 &&
    path.length <= REVIEW_FINDING_LIMITS.pathChars &&
    !hasControlCharacter(path) &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment !== '..' && segment !== '.' && segment !== '')
  return valid ? path : null
}

function isLineNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

/** A note in the author's words, or the error for a note that is not short text. */
function parseNote(input: unknown, at: string): ReviewFindingInput<string> {
  if (input !== undefined && input !== null && typeof input !== 'string') {
    return fail(`${at}.note must be text`)
  }
  const note = typeof input === 'string' ? input.trim() : ''
  return note.length > REVIEW_FINDING_LIMITS.noteChars
    ? fail(`${at}.note is longer than ${REVIEW_FINDING_LIMITS.noteChars} characters`)
    : { ok: true, value: note }
}

function parseCommandRun(
  record: Record<string, unknown>,
  at: string
): ReviewFindingInput<ReviewCommandRunEvidence> {
  const { source, runId } = record
  if (!isReviewCommandRunSource(source)) {
    return fail(`${at}.source must be ${REVIEW_COMMAND_RUN_SOURCES.join(' or ')}`)
  }
  if (typeof runId !== 'string' || !REVIEW_COMMAND_RUN_ID_PATTERN.test(runId.trim())) {
    return fail(`${at}.runId must be the id of a run as Orca returned it`)
  }
  const note = parseNote(record.note, at)
  if (!note.ok) {
    return note
  }
  // Why rebuilt: an outcome sent along with the claim is dropped; the host reads its own record.
  return {
    ok: true,
    value: {
      kind: REVIEW_COMMAND_RUN_KIND,
      source,
      runId: runId.trim(),
      ...(note.value ? { note: note.value } : {})
    }
  }
}

function parseCodeCitation(
  record: Record<string, unknown>,
  at: string
): ReviewFindingInput<ReviewCodeCitation> {
  const filePath = parseRepositoryPath(record.filePath)
  if (!filePath) {
    return fail(`${at}.filePath must be a repository-relative file path`)
  }
  const startLine = record.startLine
  if (!isLineNumber(startLine)) {
    return fail(`${at}.startLine must be a line number, counted from 1`)
  }
  const endLine = record.endLine ?? startLine
  if (!isLineNumber(endLine) || endLine < startLine) {
    return fail(`${at}.endLine must be a line number that is not before startLine`)
  }
  if (endLine - startLine >= REVIEW_FINDING_LIMITS.citedLines) {
    return fail(`${at} cites more than ${REVIEW_FINDING_LIMITS.citedLines} lines; cite less`)
  }
  if (typeof record.quote !== 'string' || !record.quote.trim()) {
    return fail(`${at}.quote must hold the cited lines as they are in the file`)
  }
  const quote = record.quote.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
  if (quote.length > REVIEW_FINDING_LIMITS.quoteChars) {
    return fail(`${at}.quote is longer than ${REVIEW_FINDING_LIMITS.quoteChars} characters`)
  }
  const note = parseNote(record.note, at)
  if (!note.ok) {
    return note
  }
  return {
    ok: true,
    value: {
      kind: REVIEW_CODE_CITATION_KIND,
      filePath,
      startLine,
      endLine,
      quote,
      ...(note.value ? { note: note.value } : {})
    }
  }
}

function parseUnknownEvidence(
  record: Record<string, unknown>,
  kind: string,
  at: string,
  keepHostFields: boolean
): ReviewFindingInput<ReviewUnknownEvidence> {
  const kept: ReviewUnknownEvidence = { kind }
  for (const [field, value] of Object.entries(record)) {
    // Why `__proto__`: assigning it would swap the object's prototype instead of adding a field.
    const dropped =
      field === 'kind' ||
      field === '__proto__' ||
      (!keepHostFields && REVIEW_EVIDENCE_HOST_ONLY_FIELDS.includes(field))
    if (!dropped) {
      kept[field] = value
    }
  }
  let size: number
  try {
    size = JSON.stringify(kept).length
  } catch {
    return fail(`${at} must be plain JSON`)
  }
  return size > REVIEW_FINDING_LIMITS.unknownEvidenceChars
    ? fail(`${at} is larger than ${REVIEW_FINDING_LIMITS.unknownEvidenceChars} characters`)
    : { ok: true, value: kept }
}

export type ReviewEvidenceInputOptions = {
  /**
   * `reject`: only kinds this build can check (what an agent tool offers). `keep`: a kind from a
   * newer peer is stored as sent, without the host-only fields.
   */
  unknownKinds: 'reject' | 'keep'
  /** Only for what a host wrote itself, such as its own store. */
  keepHostFields?: boolean
}

function parseEvidenceItem(
  input: unknown,
  at: string,
  options: ReviewEvidenceInputOptions
): ReviewFindingInput<ReviewFindingEvidence> {
  if (!isRecord(input) || typeof input.kind !== 'string' || !input.kind.trim()) {
    return fail(`${at} must be an object with a kind, such as ${REVIEW_CODE_CITATION_KIND}`)
  }
  const kind = input.kind.trim()
  if (kind === REVIEW_CODE_CITATION_KIND) {
    return parseCodeCitation(input, at)
  }
  if (kind === REVIEW_COMMAND_RUN_KIND) {
    const run = parseCommandRun(input, at)
    // Why kept: a run from a source only a newer peer knows is stored as sent and never trusted.
    if (run.ok || options.unknownKinds === 'reject') {
      return run
    }
  }
  if (options.unknownKinds === 'reject' || kind.length > REVIEW_FINDING_LIMITS.kindChars) {
    return fail(`${at}.kind must be ${REVIEW_CODE_CITATION_KIND} or ${REVIEW_COMMAND_RUN_KIND}`)
  }
  return parseUnknownEvidence(input, kind, at, options.keepHostFields === true)
}

/** The evidence list of a finding as sent by a client or an agent; the first bad item fails it. */
export function parseReviewFindingEvidence(
  input: unknown,
  options: ReviewEvidenceInputOptions
): ReviewFindingInput<ReviewFindingEvidence[]> {
  if (!Array.isArray(input)) {
    return fail('evidence must be a list')
  }
  if (input.length > REVIEW_FINDING_LIMITS.evidenceItems) {
    return fail(`evidence holds more than ${REVIEW_FINDING_LIMITS.evidenceItems} items`)
  }
  const evidence: ReviewFindingEvidence[] = []
  for (const [index, item] of input.entries()) {
    const parsed = parseEvidenceItem(item, `evidence[${index}]`, options)
    if (!parsed.ok) {
      return parsed
    }
    evidence.push(parsed.value)
  }
  return { ok: true, value: evidence }
}

/** Evidence read back from a host's own store: unreadable items are dropped, the rest survive. */
export function readStoredReviewFindingEvidence(input: unknown): ReviewFindingEvidence[] {
  if (!Array.isArray(input)) {
    return []
  }
  const evidence: ReviewFindingEvidence[] = []
  for (const item of input.slice(0, REVIEW_FINDING_LIMITS.evidenceItems)) {
    const parsed = parseEvidenceItem(item, 'evidence', {
      unknownKinds: 'keep',
      keepHostFields: true
    })
    if (parsed.ok) {
      evidence.push(parsed.value)
    }
  }
  return evidence
}
