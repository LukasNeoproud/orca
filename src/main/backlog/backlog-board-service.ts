import { randomInt } from 'node:crypto'
import type { BacklogBoard } from '../../shared/backlog-types'
import type { BacklogChild, BacklogServiceOptions, BacklogTarget } from './backlog-service'
import { waitForBoard } from './backlog-board-startup'
import { backlogErrorMessage } from './backlog-diagnostic'

type BoardState = {
  target: BacklogTarget
  leases: Map<string, number>
  board?: BacklogBoard
  child?: BacklogChild
  starting?: Promise<BacklogBoard>
  stopping?: Promise<void>
  idleTimer?: ReturnType<typeof setTimeout>
  expiryTimer?: ReturnType<typeof setTimeout>
  stopUnverifiable?: boolean
}

const MAX_PORT_ATTEMPTS = 5

export function createBacklogBoardService(options: BacklogServiceOptions = {}) {
  const boardIdleMs = options.boardIdleMs ?? 60_000
  const leaseTtlMs = options.leaseTtlMs ?? 90_000
  const startupTimeoutMs = options.startupTimeoutMs ?? 15_000
  const boards = new Map<string, BoardState>()
  let disposed = false

  function scheduleBoardExpiry(state: BoardState): void {
    if (state.expiryTimer) {
      clearTimeout(state.expiryTimer)
    }
    if (state.leases.size === 0) {
      return
    }
    const next = Math.min(...state.leases.values())
    state.expiryTimer = setTimeout(
      () => {
        const now = Date.now()
        for (const [lease, expiry] of state.leases) {
          if (expiry <= now) {
            state.leases.delete(lease)
          }
        }
        scheduleBoardExpiry(state)
        if (state.leases.size === 0) {
          scheduleBoardStop(state)
        }
      },
      Math.max(1, next - Date.now())
    )
  }

  function scheduleBoardStop(state: BoardState): void {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
    }
    state.idleTimer = setTimeout(() => {
      void stopBoard(state).catch(() => undefined)
    }, boardIdleMs)
  }

  async function stopBoard(state: BoardState): Promise<void> {
    if (state.stopping) {
      return state.stopping
    }
    if (state.leases.size > 0 || !state.child) {
      return
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
    }
    const child = state.child
    state.stopping = child
      .stop()
      .then(() => {
        if (boards.get(state.target.key) === state) {
          boards.delete(state.target.key)
        }
      })
      .catch((error: unknown) => {
        state.stopUnverifiable = true
        throw new Error(`Backlog board stop could not be verified: ${backlogErrorMessage(error)}`)
      })
    return state.stopping
  }

  async function startBoard(state: BoardState): Promise<BacklogBoard> {
    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
      const port = randomInt(20_000, 60_000)
      let child: BacklogChild
      try {
        child = await state.target.spawn(['browser', '--no-open', '--port', String(port)])
      } catch (error) {
        if (
          /EADDRINUSE|port \d+ is already in use|address already in use/i.test(
            backlogErrorMessage(error)
          )
        ) {
          continue
        }
        throw new Error(backlogErrorMessage(error))
      }
      state.child = child
      try {
        if (disposed) {
          throw new Error('Backlog service has been disposed')
        }
        const board = await waitForBoard(child, port, startupTimeoutMs)
        state.board = board
        child.onExit(() => {
          if (state.child === child && boards.get(state.target.key) === state) {
            if (state.idleTimer) {
              clearTimeout(state.idleTimer)
            }
            if (state.expiryTimer) {
              clearTimeout(state.expiryTimer)
            }
            boards.delete(state.target.key)
          }
        })
        if (state.leases.size === 0) {
          scheduleBoardStop(state)
        }
        return board
      } catch (error) {
        try {
          await child.stop()
        } catch (stopError) {
          state.stopUnverifiable = true
          throw new Error(
            `Backlog board start failed and stop could not be verified: ${backlogErrorMessage(stopError)}`
          )
        }
        state.child = undefined
        if (
          /EADDRINUSE|port \d+ is already in use|address already in use/i.test(
            backlogErrorMessage(error)
          )
        ) {
          continue
        }
        throw error
      }
    }
    throw new Error('Backlog board could not find an available port.')
  }

  async function acquireBoard(target: BacklogTarget, leaseId: string): Promise<BacklogBoard> {
    if (disposed) {
      throw new Error('Backlog service has been disposed')
    }
    if (!leaseId.trim()) {
      throw new Error('Backlog board lease ID is required')
    }
    let state = boards.get(target.key)
    if (state?.stopUnverifiable) {
      throw new Error(
        'Backlog board state is unverifiable on this host; reconnect before starting another board.'
      )
    }
    if (state?.stopping) {
      await state.stopping
      return acquireBoard(target, leaseId)
    }
    if (!state) {
      state = { target, leases: new Map() }
      boards.set(target.key, state)
    }
    if (state.stopUnverifiable) {
      throw new Error(
        'Backlog board state is unverifiable on this host; reconnect before starting another board.'
      )
    }
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
    }
    state.leases.set(leaseId, Date.now() + leaseTtlMs)
    scheduleBoardExpiry(state)
    if (state.board) {
      return state.board
    }
    if (!state.starting) {
      state.starting = startBoard(state)
        .catch((error) => {
          state.leases.clear()
          if (state.expiryTimer) {
            clearTimeout(state.expiryTimer)
          }
          if (!state.stopUnverifiable && boards.get(target.key) === state) {
            boards.delete(target.key)
          }
          throw error
        })
        .finally(() => {
          state.starting = undefined
        })
    }
    return state.starting
  }

  async function releaseBoard(target: BacklogTarget, leaseId: string): Promise<void> {
    const state = boards.get(target.key)
    if (!state) {
      return
    }
    state.leases.delete(leaseId)
    scheduleBoardExpiry(state)
    if (state.leases.size === 0) {
      scheduleBoardStop(state)
    }
  }

  async function dispose(): Promise<void> {
    disposed = true
    const results = await Promise.allSettled(
      [...boards.values()].map(async (state) => {
        if (state.idleTimer) {
          clearTimeout(state.idleTimer)
        }
        if (state.expiryTimer) {
          clearTimeout(state.expiryTimer)
        }
        state.leases.clear()
        await state.starting?.catch(() => undefined)
        await stopBoard(state)
      })
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason
      }
    }
  }

  async function releaseTarget(target: BacklogTarget): Promise<void> {
    const boardState = boards.get(target.key)
    if (boardState) {
      boardState.leases.clear()
      clearTimeout(boardState.expiryTimer)
      // Starting may have crossed the workspace deletion request.
      await boardState.starting?.catch(() => undefined)
      await stopBoard(boardState)
    }
  }

  return { acquireBoard, releaseBoard, releaseTarget, dispose }
}
