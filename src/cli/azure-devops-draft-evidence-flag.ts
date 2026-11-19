import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { getOptionalJsonFlag, getOptionalStringFlag } from './flags'
import { RuntimeClientError } from './runtime-client'

// Why bounded: the file is read whole before the evidence in it is checked.
const MAX_EVIDENCE_FILE_CHARS = 200_000

const SHAPE =
  'a JSON list of {"kind":"code-citation","filePath":…,"startLine":…,"endLine":…,"quote":…,"note":…}'

function invalid(message: string): never {
  throw new RuntimeClientError('invalid_argument', message)
}

/**
 * The evidence of a draft from `--evidence <json>` or `--evidence-file <path>`, as parsed JSON
 * for the request builder to check; undefined when neither flag is given.
 */
export async function readAzureDevOpsDraftEvidenceFlag(
  flags: Map<string, string | boolean>,
  cwd: string
): Promise<unknown> {
  const inline = getOptionalJsonFlag(flags, 'evidence')
  const file = getOptionalStringFlag(flags, 'evidence-file')
  if (inline !== undefined && file !== undefined) {
    invalid('Use either --evidence or --evidence-file, not both')
  }
  if (inline === undefined && file === undefined) {
    return undefined
  }
  let text = inline
  if (file !== undefined) {
    try {
      text = await readFile(isAbsolute(file) ? file : join(cwd, file), 'utf8')
    } catch (error) {
      invalid(
        `--evidence-file could not be read: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  if (text === undefined || text.length > MAX_EVIDENCE_FILE_CHARS) {
    invalid(`The evidence is longer than ${MAX_EVIDENCE_FILE_CHARS} characters`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    invalid(`The evidence must be ${SHAPE}`)
  }
  // One citation may be passed without the list around it.
  return Array.isArray(parsed) ? parsed : [parsed]
}
