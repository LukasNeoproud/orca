// Which hover contexts the pointer is over, for one chat. A hover override is lit by the nearest
// keyed Box above the element, or by any member of its (plugin, scope) group wherever that
// member sits: a Pane row can light a mark in the transcript.

export const CLAUDE_MODS_MAX_HOVER_KEY = 10_000

export function claudeModsBoxHoverId(instanceId: string): string {
  return `box:${instanceId}`
}

/** Two plugins never share a group, so the plugin is part of its identity. */
export function claudeModsGroupHoverId(plugin: string, scope: string): string {
  return `group:${plugin}\u0000${scope}`
}

/** A Box `key` that names a hover context: non-empty, bounded and free of control characters. */
export function isClaudeModsHoverKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > CLAUDE_MODS_MAX_HOVER_KEY) {
    return false
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return false
    }
  }
  return true
}

export class ClaudeModsHoverStore {
  private readonly depth = new Map<string, number>()
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The pointer entered a context; nested members of one group count each. */
  enter(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      const count = this.depth.get(id) ?? 0
      this.depth.set(id, count + 1)
      changed ||= count === 0
    }
    this.notify(changed)
  }

  leave(ids: readonly string[]): void {
    let changed = false
    for (const id of ids) {
      const count = this.depth.get(id) ?? 0
      if (count <= 1) {
        changed ||= this.depth.delete(id)
      } else {
        this.depth.set(id, count - 1)
      }
    }
    this.notify(changed)
  }

  /** Whether the pointer is over `boxId`'s Box or any member of `groupId`. */
  isLit(boxId: string | null, groupId: string | null): boolean {
    return (
      (boxId !== null && this.depth.has(boxId)) || (groupId !== null && this.depth.has(groupId))
    )
  }

  private notify(changed: boolean): void {
    if (changed) {
      for (const listener of this.listeners) {
        listener()
      }
    }
  }
}
