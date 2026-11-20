import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getOptionalJsonFlag, getOptionalStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'

export type QualityGateProposalInput = { gates: unknown[]; rationale?: string }

const GATES_USAGE =
  'Give the gates as a JSON array of {"name","command"} objects, with optional "required", "timeoutSeconds", "gateId" and "rationale".'

function parse(text: string, source: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new RuntimeClientError('invalid_argument', `${source} is not valid JSON. ${GATES_USAGE}`)
  }
}

/**
 * The proposal named on the command line: `--gates` holds the JSON array, `--file` a JSON file with
 * the array or with `{ "gates": [...], "rationale": "..." }`. The host checks each gate.
 */
export function readQualityGateProposalInput(
  flags: Map<string, string | boolean>,
  cwd: string
): QualityGateProposalInput {
  const inline = getOptionalJsonFlag(flags, 'gates')
  const file = getOptionalStringFlag(flags, 'file')
  if ((inline === undefined) === (file === undefined)) {
    throw new RuntimeClientError('invalid_argument', `Use either --gates or --file. ${GATES_USAGE}`)
  }
  let parsed: unknown
  if (file === undefined) {
    parsed = parse(inline ?? '', '--gates')
  } else {
    let text: string
    try {
      text = readFileSync(resolve(cwd, file), 'utf-8')
    } catch {
      throw new RuntimeClientError('invalid_argument', `Could not read the file ${file}.`)
    }
    parsed = parse(text, file)
  }
  const wrapped = parsed && typeof parsed === 'object' && 'gates' in parsed ? parsed : null
  const gates: unknown = wrapped ? wrapped.gates : parsed
  if (!Array.isArray(gates) || gates.length === 0) {
    throw new RuntimeClientError('invalid_argument', GATES_USAGE)
  }
  const fileRationale =
    wrapped && 'rationale' in wrapped && typeof wrapped.rationale === 'string'
      ? wrapped.rationale
      : undefined
  const rationale = getOptionalStringFlag(flags, 'rationale') ?? fileRationale
  return { gates, ...(rationale ? { rationale } : {}) }
}
