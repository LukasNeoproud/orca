import { toast } from 'sonner'

/** Desktop floors every mod toast at 6 s and caps its line at 240 characters. */
const MIN_DURATION_MS = 6000
const DEFAULT_DURATION_MS = 4000
const MAX_CHARS = 240

type ToastData = { id: string; description: string; duration: number }
type ShowToast = (message: string, data: ToastData) => void

type Shown = { count: number; until: number }
type Held = { plugin: string; text: string; duration: number; at: number }

/** The toast's single line, cut by code point so an emoji is never split. */
export function claudeModsToastLine(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  const points = Array.from(line)
  return points.length > MAX_CHARS ? `${points.slice(0, MAX_CHARS - 1).join('')}…` : line
}

/**
 * One chat's mod toasts: repeats from a plugin coalesce into one toast with a count, each lasts
 * at least 6 s, and a toast for a hidden chat waits (newest per plugin wins) until it is seen.
 */
export class ClaudeModsToaster {
  private readonly shown = new Map<string, Shown>()
  private readonly held = new Map<string, Held>()

  constructor(
    private readonly sessionId: string,
    private visible: boolean,
    private readonly show: ShowToast = (message, data) => void toast(message, data),
    private readonly now: () => number = Date.now
  ) {}

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible) {
      return
    }
    const held = [...this.held.values()]
    this.held.clear()
    for (const entry of held) {
      // A toast that outlived its own time while unseen is stale.
      if (this.now() - entry.at <= entry.duration) {
        this.display(entry.plugin, entry.text, entry.duration)
      }
    }
  }

  push(plugin: string, text: string, timeoutMs?: number): void {
    const duration = Math.max(timeoutMs ?? DEFAULT_DURATION_MS, MIN_DURATION_MS)
    if (this.visible) {
      this.display(plugin, text, duration)
    } else {
      this.held.set(plugin, { plugin, text, duration, at: this.now() })
    }
  }

  private display(plugin: string, text: string, duration: number): void {
    const now = this.now()
    const previous = this.shown.get(plugin)
    const count = previous && now < previous.until ? previous.count + 1 : 1
    this.shown.set(plugin, { count, until: now + duration })
    const line = claudeModsToastLine(text)
    this.show(count > 1 ? `${line} (×${count})` : line, {
      id: `claude-mods:${this.sessionId}:${plugin}`,
      description: plugin,
      duration
    })
  }
}
