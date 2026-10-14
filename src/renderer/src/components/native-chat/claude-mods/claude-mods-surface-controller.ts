import {
  EMPTY_CLAUDE_MODS_PANE_ROSTER,
  type ClaudeModsPaneRoster,
  type ClaudeModsRequestSubtype,
  type ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import { readClaudeModsTree, type ClaudeModsPress } from './claude-mods-tree'
import { openClaudeModsResubscribingStream } from './claude-mods-resubscribing-stream'
import {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsComponent,
  type ClaudeModsSnapshot,
  type ClaudeModsTransport,
  type ClaudeModsViewport
} from './claude-mods-surface-types'

export {
  CLAUDE_MODS_BAND_ID,
  type ClaudeModsComponent,
  type ClaudeModsDrawing,
  type ClaudeModsLogLine,
  type ClaudeModsSnapshot,
  type ClaudeModsTransport,
  type ClaudeModsViewport
} from './claude-mods-surface-types'

const MAX_LOG_LINES = 20

const INITIAL: ClaudeModsSnapshot = {
  available: false,
  roster: EMPTY_CLAUDE_MODS_PANE_ROSTER,
  statuses: {},
  logs: [],
  drawings: {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One chat's view of its Claude session's mods: the pane roster, the drawings of the pane shown
 * and of the band above the prompt, and the presses and typing that go back. Draws only what is
 * mounted, coalesces redraws per instance, and drops answers that predate a new child.
 */
export class ClaudeModsSurfaceController {
  private snapshot: ClaudeModsSnapshot = INITIAL
  private readonly listeners = new Set<() => void>()
  private closeStream: (() => void) | null = null
  private generation = 0
  private logId = 0
  private readonly inFlight = new Set<string>()
  private readonly dirty = new Set<string>()
  // A band no mod draws is not asked again until something invalidates.
  private bandUnhooked = false
  private readonly viewports = new Map<ClaudeModsComponent, ClaudeModsViewport>()

  constructor(
    private readonly transport: ClaudeModsTransport,
    private readonly onToast: (plugin: string, text: string, timeoutMs?: number) => void
  ) {}

  getSnapshot = (): ClaudeModsSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    this.closeStream ??= openClaudeModsResubscribingStream(this.transport, {
      onEvent: (event) => this.onEvent(event),
      onClose: () => this.update({ ...INITIAL })
    })
  }

  stop(): void {
    this.closeStream?.()
    this.listeners.clear()
  }

  setViewport(component: ClaudeModsComponent, viewport: ClaudeModsViewport): void {
    const previous = this.viewports.get(component)
    if (
      previous?.columns === viewport.columns &&
      previous.rows === viewport.rows &&
      previous.isFullscreen === viewport.isFullscreen
    ) {
      return
    }
    this.viewports.set(component, viewport)
    // A change of columns re-runs the hooked sites, as it does in the terminal.
    if (previous) {
      this.redrawMounted(component === 'Pane' ? 'panes' : 'band')
    }
  }

  press(instanceId: string, press: ClaudeModsPress, key?: string, href?: string): void {
    void this.act(instanceId, 'ui_press', {
      ...press,
      ...(key ? { key } : {}),
      ...(href ? { href } : {})
    })
  }

  input(
    instanceId: string,
    press: ClaudeModsPress,
    key: string | undefined,
    kind: 'change' | 'submit',
    value: string
  ): Promise<void> {
    return this.act(instanceId, 'ui_input', {
      ...press,
      kind,
      value,
      ...(key ? { key } : {}),
      component: this.componentOf(instanceId),
      instance_id: instanceId
    })
  }

  select(instanceId: string, press: ClaudeModsPress, key: string | undefined, value: string): void {
    void this.act(instanceId, 'ui_select', {
      ...press,
      value,
      ...(key ? { key } : {}),
      component: this.componentOf(instanceId),
      instance_id: instanceId
    })
  }

  showPane(id: string): void {
    if (this.snapshot.roster.shown_id !== id) {
      void this.send('ui_pane_show', { id })
    }
  }

  focusPane(id: string | null): void {
    const roster = this.snapshot.roster
    if (roster.focused_id !== id || (id !== null && roster.focus_requested_id === id)) {
      void this.send('ui_pane_focus', { id })
    }
  }

  closePane(id: string): void {
    void this.send('ui_close', { id })
  }

  clearLogs(): void {
    this.update({ ...this.snapshot, logs: [] })
  }

  private componentOf(instanceId: string): ClaudeModsComponent {
    return instanceId === CLAUDE_MODS_BAND_ID ? 'AbovePrompt' : 'Pane'
  }

  private async act(
    instanceId: string,
    subtype: ClaudeModsRequestSubtype,
    fields: Record<string, unknown>
  ): Promise<void> {
    const answer = await this.send(subtype, fields)
    // A retired handle ran nothing: the tree on screen is stale, so ask for the current one.
    if (isRecord(answer) && answer.handled === false) {
      this.render(instanceId)
    }
  }

  private async send(
    subtype: ClaudeModsRequestSubtype,
    fields: Record<string, unknown>
  ): Promise<unknown> {
    try {
      return await this.transport.request(subtype, fields)
    } catch (error) {
      console.warn(`[claude-mods] ${subtype} failed:`, error)
      return null
    }
  }

  private onEvent(event: ClaudeModsSurfaceEvent): void {
    switch (event.type) {
      case 'scroll':
      case 'focus':
        // Plugin-initiated moves this surface does not draw yet.
        return
      case 'state':
        this.generation += 1
        this.bandUnhooked = false
        this.update({
          ...INITIAL,
          available: event.available,
          ...(event.reason ? { reason: event.reason } : {}),
          roster: event.roster,
          statuses: event.statuses,
          logs: this.snapshot.logs
        })
        this.redrawMounted('all')
        return
      case 'panes':
        this.applyRoster(event.roster)
        return
      case 'invalidate':
        this.bandUnhooked = false
        this.redrawMounted('all', event.instances)
        return
      case 'toast':
        this.onToast(event.plugin, event.text, event.timeoutMs)
        return
      case 'status': {
        const statuses = { ...this.snapshot.statuses }
        if (event.text === null) {
          delete statuses[event.plugin]
        } else {
          statuses[event.plugin] = event.text
        }
        this.update({ ...this.snapshot, statuses })
        return
      }
      case 'log': {
        const line = { id: ++this.logId, plugin: event.plugin, text: event.text }
        this.update({ ...this.snapshot, logs: [...this.snapshot.logs, line].slice(-MAX_LOG_LINES) })
      }
    }
  }

  private applyRoster(roster: ClaudeModsPaneRoster): void {
    const open = new Set(roster.panes.map((pane) => pane.id))
    const drawings = Object.fromEntries(
      Object.entries(this.snapshot.drawings).filter(
        ([id]) => id === CLAUDE_MODS_BAND_ID || open.has(id)
      )
    )
    const shownChanged = roster.shown_id !== this.snapshot.roster.shown_id
    this.update({ ...this.snapshot, roster, drawings })
    if (shownChanged && roster.shown_id && !drawings[roster.shown_id]) {
      this.render(roster.shown_id)
    }
  }

  private redrawMounted(scope: 'all' | 'panes' | 'band', instances?: string[]): void {
    if (!this.snapshot.available) {
      return
    }
    const mounted: string[] = []
    if (scope !== 'panes' && !this.bandUnhooked) {
      mounted.push(CLAUDE_MODS_BAND_ID)
    }
    const shown = this.snapshot.roster.shown_id
    if (scope !== 'band' && shown) {
      mounted.push(shown)
    }
    for (const id of mounted) {
      if (!instances || instances.includes(id)) {
        this.render(id)
      }
    }
  }

  private render(instanceId: string): void {
    if (this.inFlight.has(instanceId)) {
      this.dirty.add(instanceId)
      return
    }
    this.inFlight.add(instanceId)
    const generation = this.generation
    const component = this.componentOf(instanceId)
    const viewport = this.viewports.get(component)
    void this.send('ui_render', {
      component,
      instance_id: instanceId,
      props: {},
      ...(viewport ? { viewport } : {})
    }).then((answer) => {
      this.inFlight.delete(instanceId)
      if (generation === this.generation && isRecord(answer)) {
        this.adoptDrawing(instanceId, answer)
      }
      if (this.dirty.delete(instanceId)) {
        this.render(instanceId)
      }
    })
  }

  private adoptDrawing(instanceId: string, answer: Record<string, unknown>): void {
    const hooked = answer.hooked !== false
    if (instanceId === CLAUDE_MODS_BAND_ID && !hooked) {
      this.bandUnhooked = true
    }
    const isPane = instanceId !== CLAUDE_MODS_BAND_ID
    if (isPane && !this.snapshot.roster.panes.some((pane) => pane.id === instanceId)) {
      return
    }
    const drawnBy = Array.isArray(answer.drawn_by)
      ? answer.drawn_by.filter((name): name is string => typeof name === 'string')
      : []
    this.update({
      ...this.snapshot,
      drawings: {
        ...this.snapshot.drawings,
        [instanceId]: { tree: readClaudeModsTree(answer.tree), hooked, drawnBy }
      }
    })
  }

  private update(next: ClaudeModsSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}
