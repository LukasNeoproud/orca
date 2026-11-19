import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  QUALITY_GATE_UNLINKED_SOURCE,
  type QualityGateSourceState
} from '../../shared/quality-gate-types'
import { parsePorcelainV1Records } from '../git/porcelain-v1-records'
import { gitExecFileAsync, gitOptionalLocksDisabledEnv } from '../git/runner'

const GIT_TIMEOUT_MS = 20_000
// Past this many changed paths only the status listing is hashed; a stat per path would cost
// more than the answer is worth.
const MAX_STATTED_PATHS = 2_000

export type QualityGateSourceTarget = {
  /** Host path of the workspace root. */
  path: string
  /** False for a folder workspace: there is no commit to tie a run to. */
  git: boolean
  wslDistro?: string
}

async function statSignature(root: string, relativePath: string): Promise<string> {
  try {
    const stats = await lstat(join(root, relativePath))
    return `${stats.size}:${Math.round(stats.mtimeMs)}`
  } catch {
    return 'absent'
  }
}

/**
 * The commit and the uncommitted state of a worktree. Both git commands date from before Git 2.25.
 *
 * Why size and mtime rather than content: a second edit to an already modified file leaves the
 * status listing unchanged, and hashing every changed file would read the whole diff on each
 * status call. Ignored files are left out, so build output does not make a result stale.
 */
export async function readQualityGateSourceState(
  target: QualityGateSourceTarget
): Promise<QualityGateSourceState> {
  if (!target.git) {
    return QUALITY_GATE_UNLINKED_SOURCE
  }
  const options = {
    cwd: target.path,
    timeout: GIT_TIMEOUT_MS,
    env: gitOptionalLocksDisabledEnv(),
    ...(target.wslDistro ? { wslDistro: target.wslDistro } : {})
  }
  let head: string | null = null
  try {
    head = (await gitExecFileAsync(['rev-parse', '--verify', 'HEAD'], options)).stdout.trim()
  } catch {
    // An unborn branch has no commit yet; a missing repository fails the status below as well.
  }
  let listing: string
  try {
    listing = (
      await gitExecFileAsync(['status', '--porcelain=v1', '-z', '--untracked-files=all'], options)
    ).stdout
  } catch {
    return { head: head || null, clean: null, fingerprint: null }
  }
  const records = parsePorcelainV1Records(listing)
  const hash = createHash('sha256').update(listing)
  for (const record of records.slice(0, MAX_STATTED_PATHS)) {
    hash.update(`\0${record.path}\0${await statSignature(target.path, record.path)}`)
  }
  return { head: head || null, clean: records.length === 0, fingerprint: hash.digest('hex') }
}
