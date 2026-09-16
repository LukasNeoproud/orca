const inFlight = new Map<string, Set<Promise<unknown>>>()
const retiring = new Set<string>()

export function trackBacklogOperation<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  if (retiring.has(workspaceId)) {
    return Promise.reject(new Error('backlog_workspace_retiring'))
  }
  const promise = run()
  let pending = inFlight.get(workspaceId)
  if (!pending) {
    pending = new Set()
    inFlight.set(workspaceId, pending)
  }
  pending.add(promise)
  const settle = (): void => {
    pending.delete(promise)
    if (pending.size === 0) {
      inFlight.delete(workspaceId)
    }
  }
  void promise.then(settle, settle)
  return promise
}

export async function beginBacklogWorkspaceRetirement(workspaceId: string): Promise<() => void> {
  if (retiring.has(workspaceId)) {
    throw new Error('backlog_workspace_retiring')
  }
  retiring.add(workspaceId)
  const pending = inFlight.get(workspaceId)
  if (pending) {
    await Promise.allSettled(pending)
  }
  return () => retiring.delete(workspaceId)
}
