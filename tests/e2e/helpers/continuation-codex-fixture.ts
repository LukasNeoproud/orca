import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { quoteStartupArg } from '../../../src/shared/tui-agent-startup-shell'
import { buildFakeAgentCommandOverride } from './fake-agent-command-override'

export const CONTINUATION_CODEX_SOURCE_SESSION_ID = '00000000-0000-4000-8000-000000000001'
export const CONTINUATION_CODEX_READY_MARKER = 'ORCA_E2E_CONTINUATION_CODEX_READY'
export const CONTINUATION_CODEX_COMPACTED_MARKER = 'ORCA_E2E_CONTINUATION_CODEX_COMPACTED'
export const CONTINUATION_CODEX_DRAFT_MARKER = 'ORCA_E2E_CONTINUATION_CODEX_DRAFT'

const fixturePath = path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'continuation-codex.cjs')

function pathKey(environment: NodeJS.ProcessEnv): string {
  return Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
}

function posixWrapper(): string {
  return `#!/bin/sh\nexec ${quoteStartupArg(process.execPath, 'posix')} ${quoteStartupArg(fixturePath, 'posix')} "$@"\n`
}

function windowsWrapper(): string {
  return `@echo off\r\n${quoteStartupArg(process.execPath, 'cmd')} ${quoteStartupArg(fixturePath, 'cmd')} %*\r\n`
}

/** Installs a fake provider only in a disposable PATH prefix for an isolated Electron profile. */
export function installContinuationCodexFixture(
  options: {
    sessionId?: string
  } = {}
): {
  commandOverride: string
  compactFailurePath: string
  eventLedgerPath: string
  launchEnv: NodeJS.ProcessEnv
  sessionId: string
  settings: {
    defaultTuiAgent: 'codex'
    agentCmdOverrides: { codex: string }
    agentDefaultEnv: { codex: { PATH: string } }
  }
  failNextCompaction: (message?: string) => void
  clearCompactionFailure: () => void
  readEvents: () => Record<string, unknown>[]
  dispose: () => void
} {
  const root = mkdtempSync(path.join(tmpdir(), 'orca-continuation-codex-'))
  const bin = path.join(root, 'bin')
  const sessionId = options.sessionId ?? CONTINUATION_CODEX_SOURCE_SESSION_ID
  const executable = path.join(bin, 'codex')
  const windowsExecutable = path.join(bin, 'codex.cmd')
  const compactFailurePath = path.join(root, 'compact-failure.txt')
  const eventLedgerPath = path.join(root, 'events.jsonl')
  mkdirSync(bin, { recursive: true, mode: 0o700 })
  writeFileSync(executable, posixWrapper(), { mode: 0o700 })
  chmodSync(executable, 0o700)
  writeFileSync(windowsExecutable, windowsWrapper())
  const key = pathKey(process.env)
  const fixturePath = [bin, process.env[key] ?? ''].filter(Boolean).join(path.delimiter)
  const agentExecutable = process.platform === 'win32' ? windowsExecutable : executable
  const commandOverride = `${buildFakeAgentCommandOverride(agentExecutable)} --fixture-original`
  return {
    commandOverride,
    compactFailurePath,
    eventLedgerPath,
    launchEnv: {
      [key]: fixturePath,
      ORCA_E2E_CONTINUATION_CODEX_SESSION_ID: sessionId,
      ORCA_E2E_CONTINUATION_CODEX_COMPACT_FAILURE_FILE: compactFailurePath,
      ORCA_E2E_CONTINUATION_CODEX_LEDGER: eventLedgerPath
    },
    sessionId,
    settings: {
      defaultTuiAgent: 'codex',
      agentCmdOverrides: { codex: commandOverride },
      agentDefaultEnv: { codex: { PATH: fixturePath } }
    },
    failNextCompaction: (message = 'fixture compact failure') =>
      writeFileSync(compactFailurePath, message),
    clearCompactionFailure: () => {
      if (existsSync(compactFailurePath)) {
        unlinkSync(compactFailurePath)
      }
    },
    readEvents: () => {
      if (!existsSync(eventLedgerPath)) {
        return []
      }
      return readFileSync(eventLedgerPath, 'utf8')
        .split('\n')
        .flatMap((line) => {
          try {
            return line ? [JSON.parse(line) as Record<string, unknown>] : []
          } catch {
            return []
          }
        })
    },
    dispose: () => rmSync(root, { recursive: true, force: true })
  }
}

export function continuationCodexRolloutPath(codexHome: string, sessionId: string): string {
  return path.join(codexHome, 'sessions', '2020', '01', '02', `rollout-${sessionId}.jsonl`)
}
