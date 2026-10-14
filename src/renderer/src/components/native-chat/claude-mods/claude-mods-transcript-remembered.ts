import type { ClaudeModsSiteAnswer } from './claude-mods-transcript-answer'

/** Rows a long transcript scrolls back through before the oldest answer is forgotten. */
const MAX_REMEMBERED = 200

export type RememberedAnswer = {
  component: string
  instanceId: string
  answer: ClaudeModsSiteAnswer
  /** The props the answer was asked with. */
  props: Record<string, unknown>
}

/** The last answer of sites that unmounted, so a virtualized row scrolled back draws at once. */
export class ClaudeModsRememberedAnswers {
  private readonly entries = new Map<string, RememberedAnswer>()

  set(key: string, entry: RememberedAnswer): void {
    this.entries.delete(key)
    this.entries.set(key, entry)
    if (this.entries.size > MAX_REMEMBERED) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) {
        this.entries.delete(oldest.value)
      }
    }
  }

  peek(key: string): RememberedAnswer | undefined {
    return this.entries.get(key)
  }

  take(key: string): RememberedAnswer | undefined {
    const entry = this.entries.get(key)
    this.entries.delete(key)
    return entry
  }

  deleteWhere(test: (entry: RememberedAnswer) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (test(entry)) {
        this.entries.delete(key)
      }
    }
  }

  clear(): void {
    this.entries.clear()
  }
}
