import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AZURE_DEVOPS_REVIEW_TOOLS } from '../shared/azure-devops-review-tools'
import type { AzureDevOpsReviewDraftView } from '../shared/azure-devops-review-types'
import { REVIEW_FINDING_SEVERITIES } from '../shared/review-finding'
import {
  AzureDevOpsReviewCreateDraftParams,
  AzureDevOpsReviewUpdateDraftParams
} from '../shared/rpc-contract/azure-devops-review-params'
import { formatAzureDevOpsDrafts } from './azure-devops-format'
import { callAzureDevOpsReviewTool } from './azure-devops-review-mcp'
import { AZURE_DEVOPS_HANDLERS } from './handlers/azure-devops'
import { RuntimeClientError } from './runtime-client'
import { AZURE_DEVOPS_COMMAND_SPECS } from './specs/azure-devops'

/**
 * How an agent attaches a severity and evidence to a draft: the MCP tools (which the Pi extension
 * forwards to, see its own test) and `orca ado draft create` / `update`. Every request is also
 * parsed by the host's own schema, so a request that passes here is one the host accepts.
 */

const pullRequestKey = 'dev.azure.com/contoso+repo+7'
const citation = {
  kind: 'code-citation',
  filePath: 'src/cart.ts',
  startLine: 4,
  endLine: 5,
  quote: 'sum += item'
}

type Call = { method: string; params: unknown }

function fakeClient() {
  const calls: Call[] = []
  const client = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params })
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the callers read only `.result` of the response, which this stub provides.
      return { result: { draft: { id: 'd1' } } } as never
    }
  }
  return { client, calls }
}

/** What the host makes of a request, by the schema its RPC method parses it with. */
function asTheHostReadsIt(call: Call): unknown {
  return call.method === 'azureDevOpsReview.createDraft'
    ? AzureDevOpsReviewCreateDraftParams.parse(call.params)
    : AzureDevOpsReviewUpdateDraftParams.parse(call.params)
}

const createArguments = {
  pullRequestKey,
  kind: 'inline',
  body: 'Negative prices lower the total.',
  file: 'src/cart.ts',
  line: 5
}

describe('severity and evidence through the MCP tools', () => {
  it('declares both on the create and the update tool, with the values an agent may send', () => {
    for (const name of ['ado_create_draft', 'ado_update_draft']) {
      const tool = AZURE_DEVOPS_REVIEW_TOOLS.find((candidate) => candidate.name === name)
      expect(tool?.inputSchema.properties).toMatchObject({
        severity: { type: 'string', enum: [...REVIEW_FINDING_SEVERITIES] },
        evidence: {
          type: 'array',
          maxItems: 10,
          items: {
            properties: {
              kind: { enum: ['code-citation', 'command-run'] },
              source: { enum: ['quality-gate'] },
              runId: { type: 'string' }
            },
            required: ['kind']
          }
        }
      })
    }
  })

  it('stores a severity and evidence with a new draft', async () => {
    const { client, calls } = fakeClient()
    await callAzureDevOpsReviewTool(client, 'ado_create_draft', {
      ...createArguments,
      severity: 'warning',
      evidence: [{ ...citation, endLine: undefined, note: ' adds the price as it is ' }]
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toMatchObject({
      severity: 'warning',
      evidence: [{ ...citation, endLine: 4, note: 'adds the price as it is' }]
    })
    expect(asTheHostReadsIt(calls[0])).toMatchObject({
      pullRequestKey,
      severity: 'warning',
      author: { kind: 'agent' }
    })
  })

  it('sends neither field when the agent gives neither', async () => {
    const { client, calls } = fakeClient()
    await callAzureDevOpsReviewTool(client, 'ado_create_draft', createArguments)
    expect(calls[0].params).not.toHaveProperty('severity')
    expect(calls[0].params).not.toHaveProperty('evidence')
  })

  it('changes the severity and replaces the evidence of a draft', async () => {
    const { client, calls } = fakeClient()
    await callAzureDevOpsReviewTool(client, 'ado_update_draft', {
      id: 'd1',
      severity: 'error',
      evidence: [citation]
    })
    expect(calls[0]).toEqual({
      method: 'azureDevOpsReview.updateDraft',
      params: { id: 'd1', patch: { severity: 'error', evidence: [citation] } }
    })
    expect(asTheHostReadsIt(calls[0])).toEqual(calls[0].params)
  })

  it.each<[string, Record<string, unknown>]>([
    ['severity must be one of error, warning, suggestion, nit', { severity: 'critical' }],
    ['severity must be one of error, warning, suggestion, nit', { severity: 3 }],
    ['evidence must be a list', { evidence: 'src/cart.ts:4' }],
    [
      'evidence[0] must be an object with a kind, such as code-citation',
      { evidence: [{ filePath: 'src/cart.ts', startLine: 4, quote: 'sum += item' }] }
    ],
    [
      'evidence[0].filePath must be a repository-relative file path',
      { evidence: [{ ...citation, filePath: undefined }] }
    ],
    [
      'evidence[0].startLine must be a line number, counted from 1',
      { evidence: [{ ...citation, startLine: '4' }] }
    ],
    [
      'evidence[1].quote must hold the cited lines as they are in the file',
      { evidence: [citation, { ...citation, quote: undefined }] }
    ],
    [
      'evidence[0].kind must be code-citation or command-run',
      { evidence: [{ kind: 'test-run', exitCode: 0 }] }
    ],
    [
      'evidence[0].source must be quality-gate',
      { evidence: [{ kind: 'command-run', source: 'shell', runId: 'r1' }] }
    ],
    [
      'evidence[0].runId must be the id of a run as Orca returned it',
      { evidence: [{ kind: 'command-run', source: 'quality-gate', runId: '../runs' }] }
    ]
  ])('answers "%s" and asks the host nothing', async (error, wrong) => {
    for (const [tool, base] of [
      ['ado_create_draft', createArguments],
      ['ado_update_draft', { id: 'd1' }]
    ] as const) {
      const { client, calls } = fakeClient()
      await expect(callAzureDevOpsReviewTool(client, tool, { ...base, ...wrong })).rejects.toThrow(
        error
      )
      expect(calls).toEqual([])
    }
  })
})

describe('severity and evidence through orca ado draft create and update', () => {
  let directory = ''
  const printed = vi.spyOn(console, 'log').mockImplementation(() => undefined)

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'orca-ado-evidence-flag-'))
    writeFileSync(join(directory, 'evidence.json'), JSON.stringify([citation]))
    writeFileSync(join(directory, 'broken.json'), '[{"kind": "code-citation"')
  })

  afterAll(() => {
    printed.mockRestore()
    rmSync(directory, { recursive: true, force: true })
  })

  async function run(path: 'ado draft create' | 'ado draft update', flags: Record<string, string>) {
    const { client, calls } = fakeClient()
    const base: Record<string, string> =
      path === 'ado draft create'
        ? { pr: pullRequestKey, kind: 'inline', body: 'Clamp it.', file: 'src/cart.ts', line: '5' }
        : { id: 'd1' }
    await AZURE_DEVOPS_HANDLERS[path]({
      flags: new Map(Object.entries({ ...base, ...flags })),
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the draft handlers use only `call` of the client.
      client: client as never,
      cwd: directory,
      json: true
    })
    return calls
  }

  it('accepts the flags on both commands', () => {
    for (const path of ['ado draft create', 'ado draft update']) {
      const spec = AZURE_DEVOPS_COMMAND_SPECS.find((candidate) => candidate.path.join(' ') === path)
      expect(spec?.allowedFlags).toEqual(
        expect.arrayContaining(['severity', 'evidence', 'evidence-file'])
      )
      expect(spec?.usage).toContain('--severity error|warning|suggestion|nit')
      expect(spec?.usage).toContain('--evidence <json> | --evidence-file <path>')
    }
  })

  it('stores a severity and evidence given as JSON, a single citation included', async () => {
    const calls = await run('ado draft create', {
      severity: 'nit',
      evidence: JSON.stringify(citation)
    })
    expect(calls[0].params).toMatchObject({ severity: 'nit', evidence: [citation] })
    expect(asTheHostReadsIt(calls[0])).toMatchObject({ severity: 'nit', evidence: [citation] })
  })

  it('reads the evidence from a file relative to the working directory', async () => {
    const calls = await run('ado draft update', { 'evidence-file': 'evidence.json' })
    expect(calls[0].params).toEqual({ id: 'd1', patch: { evidence: [citation] } })
  })

  it.each<[string, Record<string, string>]>([
    ['severity must be one of error, warning, suggestion, nit', { severity: 'high' }],
    ['The evidence must be a JSON list of', { evidence: 'src/cart.ts:4' }],
    ['The evidence must be a JSON list of', { 'evidence-file': 'broken.json' }],
    ['--evidence-file could not be read', { 'evidence-file': 'missing.json' }],
    [
      'Use either --evidence or --evidence-file, not both',
      { evidence: '[]', 'evidence-file': 'evidence.json' }
    ],
    ['evidence[0].kind must be code-citation', { evidence: '[{"kind":"test-run"}]' }],
    [
      'evidence[0].endLine must be a line number that is not before startLine',
      { evidence: JSON.stringify([{ ...citation, endLine: 2 }]) }
    ]
  ])('fails with "%s" before the host is asked', async (error, flags) => {
    for (const path of ['ado draft create', 'ado draft update'] as const) {
      const failure = await run(path, flags).then(
        () => null,
        (thrown: unknown) => thrown
      )
      expect(failure).toBeInstanceOf(RuntimeClientError)
      expect(failure).toMatchObject({ code: 'invalid_argument' })
      expect(String(failure)).toContain(error)
    }
  })

  it('stores a gate run as evidence through the tool and the flag, as the host reads it', async () => {
    const gateRun = { kind: 'command-run', source: 'quality-gate', runId: 'run-1' }
    const { client, calls } = fakeClient()
    await callAzureDevOpsReviewTool(client, 'ado_create_draft', {
      ...createArguments,
      severity: 'error',
      // An outcome sent with the claim goes nowhere: Orca reads its own record of the run.
      evidence: [citation, { ...gateRun, status: 'failed', exitCode: 1 }]
    })
    expect(calls[0].params).toMatchObject({ evidence: [citation, gateRun] })
    expect(asTheHostReadsIt(calls[0])).toMatchObject({ evidence: [citation, gateRun] })

    const viaFlag = await run('ado draft update', { evidence: JSON.stringify(gateRun) })
    expect(viaFlag[0].params).toEqual({ id: 'd1', patch: { evidence: [gateRun] } })
    expect(asTheHostReadsIt(viaFlag[0])).toEqual(viaFlag[0].params)
  })
})

describe('formatAzureDevOpsDrafts with findings', () => {
  const draft: AzureDevOpsReviewDraftView = {
    id: 'd1',
    pullRequestKey,
    kind: 'inline',
    filePath: 'src/cart.ts',
    anchor: { side: 'right', startLine: 5, endLine: 5 },
    threadId: null,
    threadStatus: null,
    body: 'Negative prices lower the total.',
    author: { kind: 'agent', label: null },
    iterationId: 2,
    commit: 'bbb2',
    state: 'draft',
    publishError: null,
    publishedThreadId: null,
    createdAt: 1,
    updatedAt: 1,
    outdated: false
  }

  it('prints a draft without severity and evidence as before', () => {
    expect(formatAzureDevOpsDrafts([{ ...draft, author: { kind: 'user' } }])).toBe(
      'd1 [draft] src/cart.ts:5-5\n  Negative prices lower the total.'
    )
  })

  it('prints a gate run and why it proved nothing', () => {
    expect(
      formatAzureDevOpsDrafts([
        {
          ...draft,
          certainty: 'uncertain',
          evidence: [{ kind: 'command-run', source: 'quality-gate', runId: 'run-1' }],
          evidenceChecks: [{ status: 'unchecked', reason: 'run-stale-commit' }]
        }
      ])
    ).toContain('  evidence 1: gate run run-1 not checked (run-stale-commit)')
  })

  it('prints the severity, the certainty and how each piece of evidence was checked', () => {
    expect(
      formatAzureDevOpsDrafts([
        {
          ...draft,
          severity: 'warning',
          certainty: 'contradicted',
          evidence: [
            citation,
            { ...citation, startLine: 9, endLine: 9 },
            { ...citation, filePath: 'src/tax.ts' },
            { kind: 'test-run', exitCode: 0 }
          ],
          evidenceChecks: [
            { status: 'confirmed' },
            { status: 'confirmed', foundAt: { startLine: 4, endLine: 4 } },
            { status: 'refuted', reason: 'file-missing' },
            { status: 'unchecked', reason: 'unknown-kind' }
          ]
        }
      ])
    ).toBe(
      [
        'd1 [draft, warning, contradicted] src/cart.ts:5-5',
        '  Negative prices lower the total.',
        '  evidence 1: src/cart.ts:4-5 confirmed',
        '  evidence 2: src/cart.ts:9-9 confirmed at lines 4-4',
        '  evidence 3: src/tax.ts:4-5 refuted (file-missing)',
        '  evidence 4: test-run not checked (unknown-kind)'
      ].join('\n')
    )
  })
})
