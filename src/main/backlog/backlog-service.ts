import type { BacklogSnapshot, BacklogTask } from '../../shared/backlog-types'
import { BacklogJsonStream, parseTaskList, parseTaskView } from './backlog-json'
import { createBacklogBoardService } from './backlog-board-service'
import { backlogErrorMessage, isUnsupportedWatch } from './backlog-diagnostic'
import { runJson, appendLimited, MAX_DIAGNOSTIC } from './backlog-json-command'

export type BacklogChild = {
  onStdout(listener: (chunk: Buffer | string) => void): () => void
  onStderr(listener: (chunk: Buffer | string) => void): () => void
  onExit(listener: (code: number | null) => void): () => void
  onError(listener: (error: Error) => void): () => void
  stop(): Promise<void>
}

export type BacklogTarget = {
  /** Unique execution host and canonical working directory. */
  key: string
  spawn(args: string[]): Promise<BacklogChild>
}

export type BacklogServiceOptions = {
  pollIntervalMs?: number
  boardIdleMs?: number
  leaseTtlMs?: number
  startupTimeoutMs?: number
}

type WatchState = {
  target: BacklogTarget
  listeners: Set<(snapshot: BacklogSnapshot) => void>
  snapshot: BacklogSnapshot
  child?: BacklogChild
  timer?: ReturnType<typeof setTimeout>
  startupTimer?: ReturnType<typeof setTimeout>
  generation: number
  mode: 'watch' | 'poll'
}

export function createBacklogService(options: BacklogServiceOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  const startupTimeoutMs = options.startupTimeoutMs ?? 15_000
  const watches = new Map<string, WatchState>()
  const boardService = createBacklogBoardService(options)
  let disposed = false

  function publish(state: WatchState, snapshot: BacklogSnapshot): void {
    state.snapshot = snapshot
    for (const listener of state.listeners) {
      listener(snapshot)
    }
  }

  function failWatch(state: WatchState, error: unknown): void {
    publish(state, {
      state: 'error',
      tasks: state.snapshot.tasks,
      error: backlogErrorMessage(error),
      stale: state.snapshot.tasks.length > 0
    })
  }

  function schedulePoll(state: WatchState): void {
    if (state.listeners.size === 0 || disposed) {
      return
    }
    state.timer = setTimeout(() => {
      void poll(state)
    }, pollIntervalMs)
  }

  async function poll(state: WatchState): Promise<void> {
    if (state.listeners.size === 0 || disposed) {
      return
    }
    try {
      const value = await runJson(state.target, ['task', 'list', '--json'], startupTimeoutMs)
      if (state.listeners.size > 0) {
        publish(state, { state: 'ready', tasks: parseTaskList(value) })
      }
    } catch (error) {
      if (state.listeners.size > 0) {
        failWatch(state, error)
      }
    } finally {
      schedulePoll(state)
    }
  }

  async function watch(state: WatchState): Promise<void> {
    const generation = ++state.generation
    let child: BacklogChild
    try {
      child = await state.target.spawn(['task', 'list', '--json', '--watch'])
    } catch (error) {
      if (state.generation === generation) {
        failWatch(state, error)
      }
      return
    }
    if (state.generation !== generation || state.listeners.size === 0 || disposed) {
      await child.stop().catch(() => undefined)
      return
    }
    state.child = child
    const stream = new BacklogJsonStream()
    let stderr = ''
    let ended = false
    const initialTimeout = (state.startupTimer = setTimeout(() => {
      end(new Error('Backlog task list did not arrive in time. Try again.'))
      void child.stop().catch(() => undefined)
    }, startupTimeoutMs))
    const end = (error: unknown): void => {
      if (ended || state.generation !== generation) {
        return
      }
      ended = true
      clearTimeout(initialTimeout)
      state.child = undefined
      if (isUnsupportedWatch(stderr)) {
        state.mode = 'poll'
        void poll(state)
      } else {
        failWatch(state, error)
      }
    }
    child.onStdout((chunk) => {
      if (ended || state.generation !== generation) {
        return
      }
      try {
        for (const value of stream.push(chunk)) {
          clearTimeout(initialTimeout)
          publish(state, { state: 'ready', tasks: parseTaskList(value) })
        }
      } catch (error) {
        end(error)
        void child.stop().catch(() => undefined)
      }
    })
    child.onStderr((chunk) => {
      stderr = appendLimited(stderr, chunk, MAX_DIAGNOSTIC)
    })
    child.onError((error) => end(error))
    child.onExit((code) => {
      clearTimeout(initialTimeout)
      if (!ended) {
        try {
          stream.finish()
        } catch (error) {
          end(error)
          return
        }
        end(stderr || `Backlog watch exited with code ${code ?? 'unknown'}.`)
      }
    })
  }

  function subscribe(
    target: BacklogTarget,
    listener: (snapshot: BacklogSnapshot) => void
  ): () => void {
    if (disposed) {
      throw new Error('Backlog service has been disposed')
    }
    let state = watches.get(target.key)
    if (!state) {
      state = {
        target,
        listeners: new Set(),
        snapshot: { state: 'loading', tasks: [] },
        generation: 0,
        mode: 'watch'
      }
      watches.set(target.key, state)
    }
    state.listeners.add(listener)
    listener(state.snapshot)
    if (
      state.listeners.size === 1 ||
      (state.mode === 'watch' && state.snapshot.state === 'error' && !state.child)
    ) {
      publish(state, {
        state: 'loading',
        tasks: state.snapshot.tasks,
        stale: state.snapshot.tasks.length > 0
      })
      void watch(state)
    }
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      state.listeners.delete(listener)
      if (state.listeners.size !== 0) {
        return
      }
      state.generation++
      clearTimeout(state.startupTimer)
      if (state.timer) {
        clearTimeout(state.timer)
      }
      if (state.child) {
        void state.child.stop().catch(() => undefined)
      }
      if (watches.get(target.key) === state) {
        watches.delete(target.key)
      }
    }
  }

  async function getTaskDetail(target: BacklogTarget, taskId: string): Promise<BacklogTask> {
    if (!taskId.trim()) {
      throw new Error('Backlog task ID is required')
    }
    return parseTaskView(
      await runJson(target, ['task', 'view', taskId, '--json'], startupTimeoutMs)
    )
  }

  async function dispose(): Promise<void> {
    disposed = true
    for (const state of watches.values()) {
      state.generation++
      clearTimeout(state.startupTimer)
      if (state.timer) {
        clearTimeout(state.timer)
      }
      if (state.child) {
        await state.child.stop().catch(() => undefined)
      }
    }
    watches.clear()
    await boardService.dispose()
  }

  async function releaseTarget(target: BacklogTarget): Promise<void> {
    const watchState = watches.get(target.key)
    if (watchState) {
      watchState.generation++
      clearTimeout(watchState.timer)
      clearTimeout(watchState.startupTimer)
      watchState.listeners.clear()
      if (watchState.child) {
        await watchState.child.stop()
      }
      watches.delete(target.key)
    }
    await boardService.releaseTarget(target)
  }

  return {
    subscribe,
    getTaskDetail,
    acquireBoard: boardService.acquireBoard,
    releaseBoard: boardService.releaseBoard,
    releaseTarget,
    dispose
  }
}
