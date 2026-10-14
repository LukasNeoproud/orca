/** Failed asks in a row before a component is taken as one the CLI cannot answer. */
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Which transcript components some mod hooks, as the CLI last said, and how often it failed to
 * answer for each. Rows subscribe, so one that built nothing for an unhooked component builds
 * again the moment that may have changed.
 */
export class ClaudeModsHookedComponents {
  private readonly hooked = new Map<string, boolean>()
  private readonly failures = new Map<string, number>()
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** True/false as the CLI said, undefined while nothing is known. */
  get(component: string): boolean | undefined {
    return this.hooked.get(component)
  }

  set(component: string, value: boolean | undefined): void {
    if (this.hooked.get(component) === value) {
      return
    }
    if (value === undefined) {
      this.hooked.delete(component)
    } else {
      this.hooked.set(component, value)
    }
    this.notify()
  }

  /** Forgets what is known about every component, or only `components`. */
  forget(components?: Iterable<string>): void {
    if (!components) {
      this.failures.clear()
      if (this.hooked.size > 0) {
        this.hooked.clear()
        this.notify()
      }
      return
    }
    for (const component of components) {
      this.failures.delete(component)
      this.set(component, undefined)
    }
  }

  answered(component: string): void {
    this.failures.delete(component)
  }

  /** Whether this failure is the last the component is allowed. */
  failed(component: string): boolean {
    const failed = (this.failures.get(component) ?? 0) + 1
    this.failures.set(component, failed)
    return failed >= MAX_CONSECUTIVE_FAILURES
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
