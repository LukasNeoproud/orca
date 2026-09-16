import { readFile, readdir, readlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { runProcess } from '../../shared/child-process/run-process'
import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import { readCodexRolloutSessionMeta } from '../codex/codex-rollout-session-meta'
import { isCodexWorkerSession } from '../ai-vault/session-scanner-codex-parser'

const MAX_OPEN_FILES = 4096
const ROLLOUT_PATH = /(?:^|[/\\])rollout-[^/\\]+\.jsonl$/

export function writableLsofFiles(output: string, pid: number): string[] {
  const paths: string[] = []
  let matchesProcess = false
  let file: { fd?: string; access?: string; type?: string; path?: string } = {}
  const flush = () => {
    if (
      matchesProcess &&
      /^\d+$/.test(file.fd ?? '') &&
      ['w', 'u'].includes(file.access ?? '') &&
      file.type === 'REG' &&
      file.path
    ) {
      paths.push(file.path)
    }
    file = {}
  }
  for (const raw of output.split('\0')) {
    const field = raw.replace(/^\n/, '')
    const value = field.slice(1)
    if (field.startsWith('p')) {
      flush()
      matchesProcess = value === String(pid)
    } else if (field.startsWith('f')) {
      flush()
      file.fd = value
    } else if (field.startsWith('a')) {
      file.access = value
    } else if (field.startsWith('t')) {
      file.type = value
    } else if (field.startsWith('n')) {
      file.path = value
    }
  }
  flush()
  return paths
}

async function writableProcessFiles(
  pid: number,
  platform: NodeJS.Platform
): Promise<string[] | null> {
  if (platform === 'linux') {
    const base = `/proc/${pid}`
    const descriptors = await readdir(join(base, 'fd')).catch(() => null)
    if (!descriptors || descriptors.length > MAX_OPEN_FILES) {
      return null
    }
    const paths: string[] = []
    for (const fd of descriptors) {
      const [path, info] = await Promise.all([
        readlink(join(base, 'fd', fd)).catch(() => null),
        readFile(join(base, 'fdinfo', fd), 'utf8').catch(() => null)
      ])
      const flags = info?.match(/^flags:\s*([0-7]+)$/m)?.[1]
      if (!path || !flags) {
        return null
      }
      if (path && flags && (Number.parseInt(flags, 8) & 3) !== 0) {
        paths.push(path)
      }
    }
    return paths
  }
  if (platform !== 'darwin') {
    return null
  }
  const result = await runProcess({
    program: '/usr/sbin/lsof',
    args: ['-nP', '-a', '-p', String(pid), '-F0pftan'],
    timeoutMs: 2000,
    maxOutputBytes: 1024 * 1024
  }).catch(() => null)
  if (!result || result.code !== 0 || result.timedOut || result.outputTruncated) {
    return null
  }
  return writableLsofFiles(result.stdout, pid)
}

/** /resume changes the open writer even when the process and its original argv stay unchanged. */
export async function readStructuredTerminalCodexRollouts(
  pid: number,
  options: {
    platform?: NodeJS.Platform
    readFiles?: (pid: number) => Promise<string[] | null>
  } = {}
): Promise<AgentProviderSessionMetadata[] | null> {
  const files = await (
    options.readFiles ?? ((id) => writableProcessFiles(id, options.platform ?? process.platform))
  )(pid)
  if (files === null || files.length > MAX_OPEN_FILES) {
    return null
  }
  const candidates = [...new Set(files.filter((path) => ROLLOUT_PATH.test(path)))]
  if (candidates.length > 64) {
    return null
  }
  const sessions = new Map<string, AgentProviderSessionMetadata>()
  for (const file of candidates) {
    const transcriptPath = await realpath(file).catch(() => null)
    const meta = transcriptPath ? await readCodexRolloutSessionMeta(transcriptPath) : null
    if (!meta || !transcriptPath) {
      return null
    }
    if (isCodexWorkerSession(meta.payload)) {
      continue
    }
    if (typeof meta.payload.source !== 'string') {
      return null
    }
    sessions.set(transcriptPath, { key: 'session_id', id: meta.id, transcriptPath })
  }
  return [...sessions.values()]
}
