/**
 * Per instance at most one `ui_render` in flight; asks that land meanwhile fold into one trailing
 * ask. A press can wait for the drawing in flight so it heals against the newest handles.
 */
export class ClaudeModsRenderPacing {
  private readonly inFlight = new Set<string>()
  private readonly dirty = new Set<string>()
  private readonly waiters = new Map<string, (() => void)[]>()

  /** True when the caller should ask now; false folds it into the trailing ask. */
  begin(instanceId: string): boolean {
    if (this.inFlight.has(instanceId)) {
      this.dirty.add(instanceId)
      return false
    }
    this.inFlight.add(instanceId)
    return true
  }

  /** The ask landed; true when the trailing ask is due, which keeps waiters waiting for it. */
  end(instanceId: string): boolean {
    this.inFlight.delete(instanceId)
    if (this.dirty.delete(instanceId)) {
      return true
    }
    for (const resolve of this.waiters.get(instanceId) ?? []) {
      resolve()
    }
    this.waiters.delete(instanceId)
    return false
  }

  /** Resolves once no drawing of the instance is in flight, or after `maxWaitMs`. */
  settled(instanceId: string, maxWaitMs: number): Promise<void> {
    if (!this.inFlight.has(instanceId)) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const waiters = this.waiters.get(instanceId) ?? []
      waiters.push(resolve)
      this.waiters.set(instanceId, waiters)
      setTimeout(resolve, maxWaitMs)
    })
  }
}
