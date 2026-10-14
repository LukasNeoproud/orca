import {
  EMPTY_CLAUDE_MODS_PANE_ROSTER,
  type ClaudeModsPaneRoster,
  type ClaudeModsRequestSubtype,
  type ClaudeModsSurfaceEvent
} from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsNode, ClaudeModsPress } from './claude-mods-tree'
import { ClaudeModsPressQueue, type ClaudeModsActSite } from './claude-mods-press-queue'
import { ClaudeModsRenderPacing } from './claude-mods-render-pacing'
import { openClaudeModsDrawings, shownClaudeModsPaneId } from './claude-mods-pane-roster'
import { readClaudeModsDrawing } from './claude-mods-drawing-answer'
import { ClaudeModsHoverStore } from './claude-mods-hover-store'
import { ClaudeModsLayoutRegistry } from './claude-mods-layout-registry'
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
  type ClaudeModsSnapshot,
  type ClaudeModsTransport,
  type ClaudeModsViewport
} from './claude-mods-surface-types'

/** A press waits this long at most for a drawing in flight before it goes with what it has. */
const MAX_PRESS_REBASE_WAIT_MS = 1_500

const INITIAL: ClaudeModsSnapshot = {
  available: false,
  roster: EMPTY_CLAUDE_MODS_PANE_ROSTER,
  statuses: {},
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
  private readonly pushListeners = new Set<(event: ClaudeModsSurfaceEvent) => void>()
  private closeStream: (() => void) | null = null
  private generation = 0
  private readonly pacing = new ClaudeModsRenderPacing()
  private readonly acts = new ClaudeModsPressQueue((subtype, fields) => this.send(subtype, fields))
  // A band no mod draws is not asked again until something invalidates.
  private bandUnhooked = false
  /** The mounted sites' layout and the viewports; what each `ui_render` ask tells the engine. */
  readonly layout = new ClaudeModsLayoutRegistry()
  /** Which hover contexts the pointer is over, across the pane, the band and the transcript. */
  readonly hover = new ClaudeModsHoverStore()

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
    this.pushListeners.clear()
  }

  setViewport(component: ClaudeModsComponent, viewport: ClaudeModsViewport): void {
    // A change of columns re-runs the hooked sites, as it does in the terminal.
    if (this.layout.setViewport(component, viewport)) {
      this.redrawMounted(component === 'Pane' ? 'panes' : 'band')
    }
  }

  press(instanceId: string, press: ClaudeModsPress, key?: string, href?: string): void {
    this.acts.press(this.actSite(instanceId), press, key, href)
  }

  input(
    instanceId: string,
    press: ClaudeModsPress,
    key: string | undefined,
    kind: 'change' | 'submit',
    value: string,
    component: string = this.componentOf(instanceId)
  ): Promise<void> {
    return this.acts.queue(
      this.actSite(instanceId),
      'ui_input',
      { press, key },
      kind === 'change',
      {
        ...press,
        kind,
        value,
        ...(key ? { key } : {}),
        component,
        instance_id: instanceId
      }
    )
  }

  select(
    instanceId: string,
    press: ClaudeModsPress,
    key: string | undefined,
    value: string,
    component: string = this.componentOf(instanceId)
  ): void {
    void this.acts.queue(this.actSite(instanceId), 'ui_select', { press, key }, false, {
      ...press,
      value,
      ...(key ? { key } : {}),
      component,
      instance_id: instanceId
    })
  }

  showPane(id: string): void {
    if (this.snapshot.roster.shown_id !== id) {
      void this.send('ui_pane_show', { id })
    }
  }

  /** `answersRequest` reports even an unchanged holder: it is the refusal of a focus request. */
  focusPane(id: string | null, answersRequest = false): void {
    const roster = this.snapshot.roster
    if (
      answersRequest ||
      roster.focused_id !== id ||
      (id !== null && roster.focus_requested_id === id)
    ) {
      void this.send('ui_pane_focus', { id })
    }
  }

  closePane(id: string): void {
    void this.send('ui_close', { id })
  }

  private componentOf(instanceId: string): ClaudeModsComponent {
    return instanceId === CLAUDE_MODS_BAND_ID ? 'AbovePrompt' : 'Pane'
  }

  private actSite(instanceId: string): ClaudeModsActSite {
    return {
      id: instanceId,
      latest: () => this.settledTree(instanceId),
      // A retired handle ran nothing: the tree on screen is stale, so ask for the current one.
      onRetired: () => this.render(instanceId)
    }
  }

  private async settledTree(instanceId: string): Promise<ClaudeModsNode | undefined> {
    await this.pacing.settled(instanceId, MAX_PRESS_REBASE_WAIT_MS)
    return this.snapshot.drawings[instanceId]?.tree
  }

  /** Asks for one pane's or the band's drawing again, e.g. after a press reached a stale tree. */
  redraw(instanceId: string): void {
    this.render(instanceId)
  }

  /** One raw `ui_*` request through this chat's transport; null when it failed (already logged). */
  request(subtype: ClaudeModsRequestSubtype, fields: Record<string, unknown>): Promise<unknown> {
    return this.send(subtype, fields)
  }

  /** Like `request`, but a failure rejects, for callers that tell a refusal from a hiccup. */
  requestStrict(
    subtype: ClaudeModsRequestSubtype,
    fields: Record<string, unknown>
  ): Promise<unknown> {
    return this.transport.request(subtype, fields)
  }

  /** Every push this controller receives, after it applied it; for sites it does not own. */
  onPush(listener: (event: ClaudeModsSurfaceEvent) => void): () => void {
    this.pushListeners.add(listener)
    return () => this.pushListeners.delete(listener)
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
    this.applyEvent(event)
    for (const listener of this.pushListeners) {
      listener(event)
    }
  }

  private applyEvent(event: ClaudeModsSurfaceEvent): void {
    switch (event.type) {
      case 'scroll':
      case 'focus':
        // Plugin-initiated moves belong to the mounted site; it hears them through onPush.
        return
      case 'state':
        this.generation += 1
        this.bandUnhooked = false
        this.update({
          ...INITIAL,
          available: event.available,
          ...(event.reason ? { reason: event.reason } : {}),
          roster: event.roster,
          statuses: event.statuses
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
        break
      }
      case 'log':
        // Desktop keeps a mod's log lines off screen; so does Orca.
        break
    }
  }

  private applyRoster(roster: ClaudeModsPaneRoster): void {
    const drawings = openClaudeModsDrawings(roster, this.snapshot.drawings)
    const shown = shownClaudeModsPaneId(roster)
    const shownChanged = shown !== shownClaudeModsPaneId(this.snapshot.roster)
    this.update({ ...this.snapshot, roster, drawings })
    if (shownChanged && shown && !drawings[shown]) {
      this.render(shown)
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
    const shown = shownClaudeModsPaneId(this.snapshot.roster)
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
    if (!this.pacing.begin(instanceId)) {
      return
    }
    const generation = this.generation
    const component = this.componentOf(instanceId)
    void this.send('ui_render', {
      component,
      instance_id: instanceId,
      ...this.layout.renderFields(component, instanceId, this.snapshot.roster)
    }).then((answer) => {
      if (generation === this.generation && isRecord(answer)) {
        this.adoptDrawing(instanceId, answer)
      }
      if (this.pacing.end(instanceId)) {
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
    this.update({
      ...this.snapshot,
      drawings: { ...this.snapshot.drawings, [instanceId]: readClaudeModsDrawing(answer, hooked) }
    })
  }

  private update(next: ClaudeModsSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}
