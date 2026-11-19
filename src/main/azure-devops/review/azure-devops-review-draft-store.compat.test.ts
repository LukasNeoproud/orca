import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AzureDevOpsReviewDraft } from '../../../shared/azure-devops-review-types'
import {
  _setAzureDevOpsReviewDraftStorePath,
  listStoredAzureDevOpsReviewDrafts,
  putStoredAzureDevOpsReviewDraft
} from './azure-devops-review-draft-store'

/**
 * The drafts file is shared by every Orca build of the user, so an older build keeps reading and
 * rewriting what this one writes. These tests pin both directions.
 */

const KINDS = ['inline', 'file', 'general', 'reply']
const STATUSES = ['active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending']

function field(record: object, name: string): unknown {
  return Object.entries(record).find(([key]) => key === name)?.[1]
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * How the build before severity and evidence read one stored draft (commit 12480c6612): the same
 * rules, field by field, returning only the fields it knew.
 */
function readDraftAsBuildBeforeFindings(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const id = field(input, 'id')
  const pullRequestKey = field(input, 'pullRequestKey')
  const body = field(input, 'body')
  const kind = field(input, 'kind')
  if (
    typeof id !== 'string' ||
    typeof pullRequestKey !== 'string' ||
    typeof body !== 'string' ||
    typeof kind !== 'string' ||
    !KINDS.includes(kind)
  ) {
    return null
  }
  const anchor = field(input, 'anchor')
  const startLine =
    anchor && typeof anchor === 'object' ? Number(field(anchor, 'startLine')) : Number.NaN
  const endLine =
    anchor && typeof anchor === 'object'
      ? Number(field(anchor, 'endLine') ?? field(anchor, 'startLine'))
      : Number.NaN
  const author = field(input, 'author')
  const agent = author && typeof author === 'object' && field(author, 'kind') === 'agent'
  const label = agent && author && typeof author === 'object' ? field(author, 'label') : null
  const filePath = field(input, 'filePath')
  const threadStatus = field(input, 'threadStatus')
  const state = field(input, 'state')
  const commit = field(input, 'commit')
  const publishError = field(input, 'publishError')
  return {
    id,
    pullRequestKey,
    kind,
    filePath:
      typeof filePath === 'string' && filePath.trim() ? filePath.trim().replace(/^\/+/, '') : null,
    anchor:
      Number.isInteger(startLine) && Number.isInteger(endLine) && startLine >= 1
        ? {
            side:
              anchor && typeof anchor === 'object' && field(anchor, 'side') === 'left'
                ? 'left'
                : 'right',
            startLine,
            endLine: Math.max(startLine, endLine)
          }
        : null,
    threadId: finite(field(input, 'threadId')),
    threadStatus:
      typeof threadStatus === 'string' && STATUSES.includes(threadStatus) ? threadStatus : null,
    body,
    author: agent
      ? { kind: 'agent', label: typeof label === 'string' && label.trim() ? label.trim() : null }
      : { kind: 'user' },
    iterationId: finite(field(input, 'iterationId')),
    commit: typeof commit === 'string' ? commit : null,
    state: state === 'published' || state === 'failed' ? state : 'draft',
    publishError: typeof publishError === 'string' ? publishError : null,
    publishedThreadId: finite(field(input, 'publishedThreadId')),
    createdAt: finite(field(input, 'createdAt')) ?? 0,
    updatedAt: finite(field(input, 'updatedAt')) ?? 0
  }
}

/** The whole file as the build before findings loaded it. */
function loadFileAsBuildBeforeFindings(path: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
  const drafts = parsed && typeof parsed === 'object' ? field(parsed, 'drafts') : null
  return (Array.isArray(drafts) ? drafts : []).flatMap((draft) => {
    const read = readDraftAsBuildBeforeFindings(draft)
    return read ? [read] : []
  })
}

const now = Date.now()

/** A draft exactly as the build before findings wrote it. */
const legacyInline = {
  id: 'legacy-inline',
  pullRequestKey: 'dev.azure.com/contoso+repo+7',
  kind: 'inline',
  filePath: 'src/cart.ts',
  anchor: { side: 'right', startLine: 4, endLine: 5 },
  threadId: null,
  threadStatus: null,
  body: 'Negative prices lower the total.',
  author: { kind: 'agent', label: 'claude' },
  iterationId: 2,
  commit: 'bbb2',
  state: 'draft',
  publishError: null,
  publishedThreadId: null,
  createdAt: now - 2000,
  updatedAt: now - 1000
}
const legacyReply = {
  ...legacyInline,
  id: 'legacy-reply',
  kind: 'reply',
  filePath: null,
  anchor: null,
  threadId: 12,
  threadStatus: 'fixed',
  body: 'Fixed in the latest push.',
  author: { kind: 'user' },
  state: 'failed',
  publishError: 'HTTP 500'
}

const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 4,
  quote: 'sum += item',
  note: 'adds the price as it is'
}
const finding: AzureDevOpsReviewDraft = {
  id: 'finding',
  pullRequestKey: 'dev.azure.com/contoso+repo+7',
  kind: 'inline',
  filePath: 'src/cart.ts',
  anchor: { side: 'right', startLine: 4, endLine: 4 },
  threadId: null,
  threadStatus: null,
  body: 'Clamp the price before adding it.',
  author: { kind: 'agent', label: null },
  iterationId: 2,
  commit: 'bbb2',
  state: 'draft',
  publishError: null,
  publishedThreadId: null,
  createdAt: now - 500,
  updatedAt: now - 500,
  severity: 'warning',
  evidence: [citation, { kind: 'check-run', origin: 'orca', command: 'pnpm test', exitCode: 1 }]
}

let directory = ''
let storeFile = ''

function writeStore(drafts: unknown[]): void {
  writeFileSync(storeFile, JSON.stringify({ version: 1, drafts }, null, 2))
  // Point the store at the file again so it forgets what it read before.
  _setAzureDevOpsReviewDraftStorePath(storeFile)
}

function fileOnDisk(): { version: unknown; drafts: unknown[] } {
  return JSON.parse(readFileSync(storeFile, 'utf-8'))
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'orca-ado-draft-store-compat-'))
  storeFile = join(directory, 'azure-devops-review-drafts.json')
  _setAzureDevOpsReviewDraftStorePath(storeFile)
})

afterEach(() => {
  _setAzureDevOpsReviewDraftStorePath(null)
  rmSync(directory, { recursive: true, force: true })
})

describe('the drafts file across Orca builds', () => {
  it('reads a file an older build wrote without changing a draft', () => {
    writeStore([legacyInline, legacyReply])
    expect(listStoredAzureDevOpsReviewDrafts()).toEqual([legacyInline, legacyReply])
  })

  it('rewrites the drafts of an older build in the shape that build wrote', () => {
    writeStore([legacyInline, legacyReply])
    putStoredAzureDevOpsReviewDraft(finding)
    const file = fileOnDisk()
    expect(file.version).toBe(1)
    expect(file.drafts.slice(0, 2)).toStrictEqual([legacyInline, legacyReply])
  })

  it('keeps severity and evidence, also of a kind it does not know, across a restart', () => {
    writeStore([legacyInline])
    putStoredAzureDevOpsReviewDraft(finding)
    _setAzureDevOpsReviewDraftStorePath(storeFile)
    expect(listStoredAzureDevOpsReviewDrafts()).toEqual([legacyInline, finding])
    // A later write of another draft keeps the unknown evidence too.
    putStoredAzureDevOpsReviewDraft({ ...finding, id: 'second', evidence: [citation] })
    _setAzureDevOpsReviewDraftStorePath(storeFile)
    expect(listStoredAzureDevOpsReviewDrafts('dev.azure.com/contoso+repo+7')[1]).toEqual(finding)
  })

  it('writes a file an older build reads in full, minus the fields it does not know', () => {
    putStoredAzureDevOpsReviewDraft(finding)
    putStoredAzureDevOpsReviewDraft({
      ...finding,
      id: 'plain',
      severity: undefined,
      evidence: undefined
    })
    const { severity: _severity, evidence: _evidence, ...known } = finding
    expect(loadFileAsBuildBeforeFindings(storeFile)).toStrictEqual([
      known,
      { ...known, id: 'plain' }
    ])
  })

  it('still reads every draft after an older build rewrote the file', () => {
    putStoredAzureDevOpsReviewDraft(finding)
    // The older build loads the file, normalizes every draft and writes them all back.
    writeStore(loadFileAsBuildBeforeFindings(storeFile))
    const [draft] = listStoredAzureDevOpsReviewDrafts()
    expect(draft).toMatchObject({ id: 'finding', body: finding.body, anchor: finding.anchor })
    // What the older build did not know is gone; the draft itself is not.
    expect(draft).not.toHaveProperty('severity')
    expect(draft).not.toHaveProperty('evidence')
  })

  it('does not write empty severity or evidence fields into the file', () => {
    putStoredAzureDevOpsReviewDraft({ ...finding, severity: undefined, evidence: undefined })
    expect(Object.keys(Object(fileOnDisk().drafts[0])).sort()).toEqual(
      Object.keys(legacyInline).sort()
    )
  })
})
