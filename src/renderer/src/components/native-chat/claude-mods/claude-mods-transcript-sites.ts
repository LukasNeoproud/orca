import type { ClaudeModsSurfaceEvent } from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsDispatch } from './claude-mods-draw-scope'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsViewport } from './claude-mods-surface-types'
import {
  readClaudeModsSiteAnswer,
  type ClaudeModsSiteAnswer
} from './claude-mods-transcript-answer'

/** Asks in flight at once, so a long transcript never floods the host. */
const MAX_CONCURRENT_ASKS = 4

type Site = {
  component: string
  instanceId: string
  watchers: Set<() => void>
  /** The props the row last asked to be drawn with. */
  ask: Record<string, unknown> | null
  answer: ClaudeModsSiteAnswer | null
  /** Bumped when an invalidate makes an answer still in flight stale. */
  epoch: number
}

export type ClaudeModsSitesTransport = Pick<ClaudeModsSurfaceController, 'request' | 'onPush'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const keyOf = (component: string, instanceId: string): string => `${component}\0${instanceId}`

/**
 * The transcript's `ui_render` sites of one chat, keyed by component and instance. Asks only
 * for mounted sites, one at a time per site and a few at a time overall, and stops asking a
 * component no mod hooks until something invalidates, so a chat without mods asks once.
 */
export class ClaudeModsTranscriptSites {
  private readonly sites = new Map<string, Site>()
  private readonly hooked = new Map<string, boolean>()
  private readonly queue = new Set<string>()
  private readonly inFlight = new Set<string>()
  // Components whose first answer is awaited: the rest of their sites wait for it.
  private readonly probing = new Set<string>()
  private generation = 0
  private viewport: ClaudeModsViewport | null = null

  constructor(private readonly transport: ClaudeModsSitesTransport) {
    transport.onPush((event) => this.onPush(event))
  }

  watch(component: string, instanceId: string, listener: () => void): () => void {
    const key = keyOf(component, instanceId)
    let site = this.sites.get(key)
    if (!site) {
      site = { component, instanceId, watchers: new Set(), ask: null, answer: null, epoch: 0 }
      this.sites.set(key, site)
    }
    const mounted = site
    mounted.watchers.add(listener)
    return () => {
      mounted.watchers.delete(listener)
      if (mounted.watchers.size === 0 && this.sites.get(key) === mounted) {
        this.sites.delete(key)
        this.queue.delete(key)
      }
    }
  }

  getAnswer(component: string, instanceId: string): ClaudeModsSiteAnswer | null {
    return this.sites.get(keyOf(component, instanceId))?.answer ?? null
  }

  /** The props a mounted site now wants drawn; asks the host unless no mod hooks the component. */
  ask(component: string, instanceId: string, props: Record<string, unknown>): void {
    const site = this.sites.get(keyOf(component, instanceId))
    if (site) {
      site.ask = props
      this.enqueue(keyOf(component, instanceId))
    }
  }

  setViewport(viewport: ClaudeModsViewport): void {
    const previous = this.viewport
    if (previous?.columns === viewport.columns && previous.rows === viewport.rows) {
      return
    }
    this.viewport = viewport
    // A change of columns re-runs the hooked sites, as it does in the terminal.
    if (previous && previous.columns !== viewport.columns) {
      for (const [key, site] of this.sites) {
        if (this.hooked.get(site.component) === true) {
          this.enqueue(key)
        }
      }
    }
  }

  /** Presses, typing and picks of a drawn tree: they answer for this site, not for a pane. */
  dispatch(component: string, instanceId: string): ClaudeModsDispatch {
    const act = async (
      subtype: 'ui_press' | 'ui_input' | 'ui_select',
      fields: Record<string, unknown>
    ) => {
      const answer = await this.transport.request(subtype, fields)
      // A retired handle ran nothing: the tree on screen is stale.
      if (isRecord(answer) && answer.handled === false) {
        this.enqueue(keyOf(component, instanceId))
      }
    }
    return {
      press: (press, key, href) =>
        void act('ui_press', {
          ...press,
          ...(key ? { key } : {}),
          ...(href ? { href } : {})
        }),
      input: (press, key, kind, value) =>
        act('ui_input', {
          ...press,
          kind,
          value,
          ...(key ? { key } : {}),
          component,
          instance_id: instanceId
        }),
      select: (press, key, value) =>
        void act('ui_select', {
          ...press,
          value,
          ...(key ? { key } : {}),
          component,
          instance_id: instanceId
        })
    }
  }

  private onPush(event: ClaudeModsSurfaceEvent): void {
    if (event.type === 'state') {
      this.reset()
    } else if (event.type === 'invalidate') {
      this.invalidate(event.instances)
    }
  }

  /** A new child: every answer and every "nobody hooks this" belongs to the old one. */
  private reset(): void {
    this.generation += 1
    this.hooked.clear()
    this.probing.clear()
    this.queue.clear()
    for (const [key, site] of this.sites) {
      site.epoch += 1
      site.answer = null
      this.notify(site)
      this.enqueue(key)
    }
  }

  private invalidate(instances: string[] | undefined): void {
    const targeted = [...this.sites].filter(
      ([, site]) => instances === undefined || instances.includes(site.instanceId)
    )
    const components = new Set(targeted.map(([, site]) => site.component))
    const stale: string[] = []
    for (const [key, site] of this.sites) {
      if (components.has(site.component)) {
        site.epoch += 1
        // Its answer in flight is dropped, so it asks again.
        if (this.inFlight.has(key)) {
          stale.push(key)
        }
      }
    }
    for (const component of components) {
      this.hooked.delete(component)
      this.probing.delete(component)
    }
    for (const key of [...targeted.map(([key]) => key), ...stale]) {
      this.enqueue(key)
    }
  }

  private enqueue(key: string): void {
    const site = this.sites.get(key)
    if (site?.ask && this.hooked.get(site.component) !== false) {
      this.queue.add(key)
      this.pump()
    }
  }

  private pump(): void {
    for (const key of this.queue) {
      if (this.inFlight.size >= MAX_CONCURRENT_ASKS) {
        return
      }
      const site = this.sites.get(key)
      if (!site?.ask || this.hooked.get(site.component) === false) {
        this.queue.delete(key)
        continue
      }
      if (this.inFlight.has(key)) {
        continue
      }
      if (this.hooked.get(site.component) === undefined) {
        if (this.probing.has(site.component)) {
          continue
        }
        this.probing.add(site.component)
      }
      this.queue.delete(key)
      void this.run(key, site, site.ask)
    }
  }

  private async run(key: string, site: Site, props: Record<string, unknown>): Promise<void> {
    this.inFlight.add(key)
    const { generation } = this
    const { epoch } = site
    const raw = await this.transport.request('ui_render', {
      component: site.component,
      instance_id: site.instanceId,
      props,
      ...(this.viewport ? { viewport: this.viewport } : {})
    })
    this.inFlight.delete(key)
    if (generation === this.generation && epoch === site.epoch) {
      this.adopt(key, site, raw)
    }
    this.pump()
  }

  private adopt(key: string, site: Site, raw: unknown): void {
    this.probing.delete(site.component)
    // A failed ask reads as unhooked: it must not be repeated by every row of the component.
    const answer = readClaudeModsSiteAnswer(raw)
    const hooked = answer?.hooked === true
    this.hooked.set(site.component, hooked)
    if (!hooked) {
      for (const [siteKey, other] of this.sites) {
        if (other.component === site.component) {
          this.queue.delete(siteKey)
          if (other !== site && other.answer) {
            other.answer = null
            this.notify(other)
          }
        }
      }
    }
    if (this.sites.get(key) === site) {
      site.answer = answer
      this.notify(site)
    }
  }

  private notify(site: Site): void {
    for (const watcher of site.watchers) {
      watcher()
    }
  }
}

const SITES = new WeakMap<object, ClaudeModsTranscriptSites>()

/** The one store of a chat's transcript sites, made on first use. */
export function claudeModsTranscriptSites(
  controller: ClaudeModsSitesTransport
): ClaudeModsTranscriptSites {
  let sites = SITES.get(controller)
  if (!sites) {
    sites = new ClaudeModsTranscriptSites(controller)
    SITES.set(controller, sites)
  }
  return sites
}
