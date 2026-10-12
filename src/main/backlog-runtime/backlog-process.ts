import type { PipedChildProcess } from '@orca/process-host/process-spec'
import { spawnProcess } from '@orca/process-host'
import {
  forceTerminateProcessTree,
  signalProcessTree
} from '@orca/process-host/process-tree-termination'
import {
  buildWslExecArgs,
  buildWslLoginShellCommand,
  quotePosixShell
} from '../../shared/wsl-login-shell-command'
import { resolveWslInteropSpawnCwd } from '../wsl-interop-spawn-directory'
import type { BacklogChild } from '../backlog/backlog-service'
import { createWslProcessGroupTermination } from '../git/wsl-process-group-termination'
import type { WslProcessGroupTermination } from '../git/wsl-process-group-termination'

export type BacklogProcessRoute =
  | { kind: 'native'; cwd: string }
  | { kind: 'wsl'; cwd: string; distro: string }

function bindData(
  stream: NodeJS.ReadableStream,
  callback: (chunk: Buffer | string) => void
): () => void {
  const listener = (chunk: Buffer | string): void => callback(chunk)
  stream.on('data', listener)
  return () => stream.off('data', listener)
}

function makeBacklogProcess(
  child: PipedChildProcess,
  stdoutMarker?: string,
  guestTermination?: WslProcessGroupTermination
): BacklogChild {
  // Streams can emit EPIPE after the child has already exited. Keep them handled.
  child.stdin.on('error', () => {})
  child.stdout.on('error', () => {})
  child.stderr.on('error', () => {})
  if (guestTermination?.observeStderr) {
    child.stderr.on('data', guestTermination.observeStderr)
  }
  child.stdin.end()
  let waitingForMarker = Boolean(stdoutMarker)
  let markerPrefix = ''
  const waitForClose = (timeoutMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(true)
        return
      }
      const done = (): void => {
        clearTimeout(timer)
        resolve(true)
      }
      child.once('close', done)
      const timer = setTimeout(() => {
        child.off('close', done)
        resolve(false)
      }, timeoutMs)
      timer.unref?.()
    })
  return {
    onStdout: (callback) =>
      bindData(child.stdout, (chunk) => {
        if (!waitingForMarker) {
          callback(chunk)
          return
        }
        markerPrefix = (markerPrefix + chunk.toString()).slice(-65_536)
        const index = markerPrefix.indexOf(stdoutMarker!)
        if (index === -1) {
          return
        }
        waitingForMarker = false
        const payload = markerPrefix.slice(index + stdoutMarker!.length)
        markerPrefix = ''
        if (payload) {
          callback(payload)
        }
      }),
    onStderr: (callback) => bindData(child.stderr, callback),
    onExit: (callback) => {
      const listener = (code: number | null): void => callback(code)
      child.on('close', listener)
      return () => child.off('close', listener)
    },
    onError: (callback) => {
      child.on('error', callback)
      return () => child.off('error', callback)
    },
    stop: async () => {
      if (!guestTermination && (child.exitCode !== null || child.signalCode !== null)) {
        return
      }
      if (guestTermination) {
        const closed = waitForClose(2_000)
        const stopped = await guestTermination.signal(child)
        if (stopped && (await closed)) {
          return
        }
        const forced = await guestTermination.force(child)
        if (forced && (await waitForClose(2_000))) {
          return
        }
        await signalProcessTree(child, 'SIGTERM')
        throw new Error('backlog_wsl_process_stop_unverifiable')
      }
      const closed = waitForClose(2_000)
      await signalProcessTree(child, 'SIGTERM')
      if (await closed) {
        return
      }
      const forced = await forceTerminateProcessTree(child)
      if (!forced || !(await waitForClose(2_000))) {
        throw new Error('backlog_process_stop_unverifiable')
      }
    }
  }
}

export async function spawnBacklogProcess(
  route: BacklogProcessRoute,
  args: readonly string[]
): Promise<BacklogChild> {
  if (route.kind === 'native') {
    return makeBacklogProcess(
      spawnProcess({
        program: 'backlog',
        args,
        cwd: route.cwd,
        env: { ...process.env, BACKLOG_CWD: route.cwd },
        detached: process.platform !== 'win32'
      })
    )
  }
  if (process.platform !== 'win32') {
    throw new Error('backlog_wsl_requires_windows')
  }
  const marker = `__ORCA_BACKLOG_BEGIN_${Math.random().toString(36).slice(2)}__`
  const command = buildWslLoginShellCommand(
    `printf %s ${quotePosixShell(marker)}; cd ${quotePosixShell(route.cwd)} && export BACKLOG_CWD=${quotePosixShell(route.cwd)} && exec backlog ${args.map(quotePosixShell).join(' ')}`
  )
  const guestTermination = createWslProcessGroupTermination(route.distro)
  return makeBacklogProcess(
    spawnProcess({
      program: 'wsl.exe',
      args: buildWslExecArgs(route.distro, guestTermination.wrapGuestArgs(['sh', '-c', command])),
      cwd: resolveWslInteropSpawnCwd(),
      detached: false
    }),
    marker,
    guestTermination
  )
}
