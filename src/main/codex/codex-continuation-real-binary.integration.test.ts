import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pty from 'node-pty'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalKittyKeyboardModeTracker } from '../../shared/terminal-kitty-keyboard-mode-tracker'
import { runProcess } from '../../shared/child-process/run-process'
import { StructuredSessionCompaction } from '../native-chat/agent-session-wire/structured-session-compaction'
import { resolveCodexCommand } from '../codex-cli/command'
import {
  openCodexAppServerConnection,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import {
  readCodexThreadId,
  readCodexThreadPath,
  readCodexTurnId
} from './codex-structured-thread-facts'
import { openCodexThread } from './codex-structured-thread-open'
import { proveCodexTuiRollout, resolvePinnedCodexRolloutProof } from './codex-tui-rollout-proof'

const RUN_REAL_BINARY = process.env.ORCA_RUN_CODEX_CONTINUATION_REAL_BINARY === '1'
const codexCommand = resolveCodexCommand()
const sourceCodexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
const sourceAuthPath = join(sourceCodexHome, 'auth.json')
const temporaryPaths: string[] = []

function notificationTurnId(params: unknown): string | null {
  return readCodexTurnId(params)
}

function digest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

async function waitForTurn(
  completed: Set<string>,
  turnId: string,
  timeoutMs = 180_000
): Promise<void> {
  if (completed.has(turnId)) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Codex turn did not complete.')), timeoutMs)
    const poll = () => {
      if (completed.has(turnId)) {
        clearTimeout(timer)
        resolve()
        return
      }
      setTimeout(poll, 50)
    }
    poll()
  })
}

async function startTurn(
  connection: CodexAppServerConnection,
  completed: Set<string>,
  threadId: string,
  text: string
): Promise<string> {
  const response = await connection.request(
    'turn/start',
    {
      threadId,
      clientUserMessageId: randomUUID(),
      input: [{ type: 'text', text }]
    },
    { timeoutMs: 30_000 }
  )
  const turnId = readCodexTurnId(response)
  if (!turnId) {
    throw new Error('Codex did not identify the started turn.')
  }
  await waitForTurn(completed, turnId)
  return turnId
}

async function waitForRollout(codexHome: string, threadId: string): Promise<string> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const path = await resolvePinnedCodexRolloutProof(codexHome, threadId)
    if (path) {
      return path
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Codex did not materialize the isolated rollout.')
}

async function waitForTuiStart(proc: pty.IPty): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Codex TUI did not initialize.')), 15_000)
    proc.onData((data) => {
      output += data
      if (/OpenAI Codex|Welcome to Codex|Sign in with ChatGPT/i.test(output)) {
        clearTimeout(timer)
        resolve()
      }
    })
    proc.onExit(() => {
      clearTimeout(timer)
      reject(new Error('Codex TUI exited before initialization.'))
    })
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('real Codex continuation', () => {
  it.skipIf(!RUN_REAL_BINARY)(
    'forks a completed checkpoint, compacts only the fork, and accepts headless resume',
    async () => {
      const version = await runProcess({
        program: codexCommand,
        args: ['--version'],
        timeoutMs: 10_000
      })
      if (version.code !== 0) {
        throw new Error(
          'The opt-in Codex continuation verification requires an available Codex CLI.'
        )
      }
      let sourceAuthIsFile = false
      try {
        sourceAuthIsFile = (await lstat(sourceAuthPath)).isFile()
      } catch {
        // The test must never create or modify a user authentication file.
      }
      if (!sourceAuthIsFile) {
        throw new Error(
          'The opt-in Codex continuation verification requires an existing Codex auth.json.'
        )
      }
      const codexHome = await mkdtemp(join(tmpdir(), 'orca-codex-continuation-home-'))
      const workspace = await mkdtemp(join(tmpdir(), 'orca-codex-continuation-workspace-'))
      temporaryPaths.push(codexHome, workspace)
      const originalAuth = await readFile(sourceAuthPath)
      await copyFile(sourceAuthPath, join(codexHome, 'auth.json'))
      await writeFile(
        join(codexHome, 'config.toml'),
        `[projects.${JSON.stringify(workspace)}]\ntrust_level = "trusted"\n`
      )
      await mkdir(join(workspace, '.git'), { recursive: true })

      const completedTurns = new Set<string>()
      const compactions = new StructuredSessionCompaction(180_000)
      let connection: CodexAppServerConnection | null = null
      try {
        connection = await openCodexAppServerConnection(
          {
            command: codexCommand,
            args: ['app-server'],
            cwd: workspace,
            env: { CODEX_HOME: codexHome }
          },
          {
            onNotification: (method, params) => {
              if (method === 'turn/completed') {
                const turnId = notificationTurnId(params)
                if (turnId) {
                  completedTurns.add(turnId)
                }
              }
              compactions.codex('candidate', method, params)
            },
            onServerRequest: (request) =>
              connection?.respondWithError(
                request.id,
                -32001,
                'The isolated continuation verification cannot answer provider prompts.'
              ),
            onExit: () => compactions.ended('candidate')
          }
        )
        const source = await openCodexThread(
          connection,
          { cwd: workspace, resumeThreadId: null },
          30_000
        )
        const checkpointTurnId = await startTurn(
          connection,
          completedTurns,
          source.threadId,
          'Reply with exactly CHECKPOINT_OK.'
        )
        const laterMarker = `LATER_TURN_${randomUUID()}`
        await startTurn(
          connection,
          completedTurns,
          source.threadId,
          `Reply with exactly ${laterMarker}.`
        )
        const sourcePath = source.historyPath ?? (await waitForRollout(codexHome, source.threadId))
        const sourceBefore = await readFile(sourcePath)
        expect(sourceBefore.toString('utf8')).toContain(laterMarker)

        const forked = await connection.request(
          'thread/fork',
          {
            threadId: source.threadId,
            lastTurnId: checkpointTurnId,
            cwd: workspace,
            excludeTurns: true,
            deferGoalContinuation: true
          },
          { timeoutMs: 30_000 }
        )
        const candidateThreadId = readCodexThreadId(forked)
        expect(candidateThreadId).toBeTruthy()
        expect(candidateThreadId).not.toBe(source.threadId)
        const candidatePath =
          readCodexThreadPath(forked) ?? (await waitForRollout(codexHome, candidateThreadId!))
        expect((await readFile(candidatePath, 'utf8')).includes(laterMarker)).toBe(false)

        const compacted = await compactions.run('candidate', candidateThreadId!, () =>
          connection!.request(
            'thread/compact/start',
            { threadId: candidateThreadId! },
            { timeoutMs: 30_000 }
          )
        )
        expect(compacted.error).toBeUndefined()
        expect(digest(await readFile(sourcePath))).toBe(digest(sourceBefore))
        expect((await readFile(sourceAuthPath)).equals(originalAuth)).toBe(true)

        expect(await connection.close()).toBe(true)
        connection = null

        const tui = pty.spawn(codexCommand, ['resume', '--no-alt-screen', candidateThreadId!], {
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
          cwd: workspace,
          env: {
            ...process.env,
            CODEX_HOME: codexHome,
            TERM: 'xterm-256color',
            ORCA_BACKGROUND_LAUNCH: '1'
          }
        })
        const exit = new Promise<void>((resolve) => tui.onExit(() => resolve()))
        const kittyKeyboard = new TerminalKittyKeyboardModeTracker()
        let output = ''
        let lastOutputAt: number | null = null
        tui.onData((data) => {
          output += data
          lastOutputAt = Date.now()
          kittyKeyboard.scan(data)
        })
        try {
          await waitForTuiStart(tui)
          const proof = await proveCodexTuiRollout({
            codexHome,
            threadId: candidateThreadId!,
            kittyKeyboardFlags: kittyKeyboard.flags,
            readOutput: () => ({ text: output, lastOutputAt }),
            write: (data) => {
              tui.write(data)
              return true
            }
          })
          expect(await realpath(proof.transcriptPath)).toBe(await realpath(candidatePath))
        } finally {
          try {
            tui.kill()
          } catch {
            // The headless TUI may already have exited.
          }
          await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 5_000))])
        }
      } finally {
        if (connection) {
          await connection.close()
        }
      }
    },
    480_000
  )
})
