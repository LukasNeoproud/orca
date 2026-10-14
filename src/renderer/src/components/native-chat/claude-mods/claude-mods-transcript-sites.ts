import type { ClaudeModsSurfaceEvent } from '../../../../../shared/claude-mods-surface'
import type { ClaudeModsDispatch } from './claude-mods-draw-scope'
import type { ClaudeModsSurfaceController } from './claude-mods-surface-controller'
import type { ClaudeModsViewport } from './claude-mods-surface-types'
import {
  readClaudeModsSiteAnswer,
  type ClaudeModsSiteAnswer
} from './claude-mods-transcript-answer'
import {
  fitClaudeModsAskProps,
  restoreClaudeModsCutStrings
} from './claude-mods-transcript-ask-bounds'
import { claudeModsSiteDispatch } from './claude-mods-transcript-dispatch'
import { ClaudeModsHookedComponents } from './claude-mods-transcript-hooked'
import { claudeModsPropsEqual } from './claude-mods-transcript-props-equal'
import { ClaudeModsRememberedAnswers } from './claude-mods-transcript-remembered'

/** Asks in flight at once, so a long transcript never floods the host. */
const MAX_CONCURRENT_ASKS = 4

type Props = Record<string, unknown>

type Site = {
  component: string
  instanceId: string
  watchers: Set<() => void>
  /** The props the row last asked to be drawn with. */
  ask: Props | null
  answer: ClaudeModsSiteAnswer | null
  /** The props `answer` was asked with. */
  answeredProps: Props | null
  /** `answer` was asked before the transcript column was known. */
  noViewport: boolean
  /** Bumped when an invalidate makes an answer still in flight stale. */
  epoch: number
}

export type ClaudeModsSitesTransport = Pick<ClaudeModsSurfaceController, 'request' | 'onPush'>

const keyOf = (component: string, instanceId: string): string => `${component}\0${instanceId}`

/**
 * The transcript's `ui_render` sites of one chat, keyed by component and instance. Asks only
 * for mounted sites, one at a time per site and a few at a time overall, and stops asking a
 * component no mod hooks until something invalidates, so a chat without mods asks once.
 */
export class ClaudeModsTranscriptSites {
  private readonly sites = new Map<string, Site>()
  private readonly hooked = new ClaudeModsHookedComponents()
  private readonly remembered = new ClaudeModsRememberedAnswers()
  private readonly queue = new Set<string>()
  private readonly inFlight = new Set<string>()
  // Components whose first answer is awaited: the rest of their sites wait for it.
  private readonly probing = new Set<string>()
  private generation = 0
  private viewport: ClaudeModsViewport | null = null

  constructor(private readonly transport: ClaudeModsSitesTransport) {
    transport.onPush((event) => this.onPush(event))
  }

  /** Calls `listener` when what is known about which components a mod hooks changes. */
  subscribeHooked = this.hooked.subscribe

  /** A mod hooks the component, so its sites keep a stable frame around core's drawing. */
  isHooked(component: string): boolean {
    return this.hooked.get(component) === true
  }

  /** Nobody hooks the component: its rows build no props and ask nothing. */
  isUnhooked(component: string): boolean {
    return this.hooked.get(component) === false
  }

  watch(component: string, instanceId: string, listener: () => void): () => void {
    const key = keyOf(component, instanceId)
    let site = this.sites.get(key)
    if (!site) {
      const kept = this.remembered.take(key)
      site = {
        component,
        instanceId,
        watchers: new Set(),
        ask: null,
        answer: kept?.answer ?? null,
        answeredProps: kept?.props ?? null,
        noViewport: false,
        epoch: 0
      }
      this.sites.set(key, site)
    }
    const mounted = site
    mounted.watchers.add(listener)
    return () => {
      mounted.watchers.delete(listener)
      if (mounted.watchers.size === 0 && this.sites.get(key) === mounted) {
        this.sites.delete(key)
        this.queue.delete(key)
        if (
          mounted.answer?.hooked &&
          mounted.answeredProps &&
          !(mounted.noViewport && this.viewport)
        ) {
          this.remembered.set(key, {
            component,
            instanceId,
            answer: mounted.answer,
            props: mounted.answeredProps
          })
        }
      }
    }
  }

  getAnswer(component: string, instanceId: string): ClaudeModsSiteAnswer | null {
    const key = keyOf(component, instanceId)
    const site = this.sites.get(key)
    return site ? site.answer : (this.remembered.peek(key)?.answer ?? null)
  }

  /**
   * The props a mounted site now wants drawn; asks the host unless no mod hooks the component
   * or the answer it holds was asked with these very props.
   */
  ask(component: string, instanceId: string, props: Props): void {
    const key = keyOf(component, instanceId)
    const site = this.sites.get(key)
    if (!site) {
      return
    }
    site.ask = props
    const held =
      site.answer && site.answeredProps && claudeModsPropsEqual(site.answeredProps, props)
    // A reply in flight may be for other props, so the held answer is only final when idle.
    if (!held || this.inFlight.has(key) || this.queue.has(key)) {
      this.enqueue(key)
    }
  }

  /** Asks again whatever the answer held: a drawn control reached a tree gone stale. */
  redraw(component: string, instanceId: string, props: Props): void {
    const key = keyOf(component, instanceId)
    const site = this.sites.get(key)
    if (site) {
      site.ask = props
      this.enqueue(key)
    }
  }

  hasViewport(): boolean {
    return this.viewport !== null
  }

  setViewport(viewport: ClaudeModsViewport): void {
    const previous = this.viewport
    if (previous?.columns === viewport.columns && previous.rows === viewport.rows) {
      return
    }
    this.viewport = viewport
    if (previous?.columns === viewport.columns) {
      return
    }
    // Answers laid out for another width are stale; the hooked sites run again, as in the terminal.
    this.remembered.clear()
    for (const [key, site] of this.sites) {
      if (this.hooked.get(site.component) === true && (previous || site.noViewport)) {
        this.enqueue(key)
      }
    }
  }

  /** Presses, typing and picks of a drawn tree: they answer for this site, not for a pane. */
  dispatch(component: string, instanceId: string): ClaudeModsDispatch {
    return claudeModsSiteDispatch(this.transport, component, instanceId, () =>
      this.enqueue(keyOf(component, instanceId))
    )
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
    this.probing.clear()
    this.queue.clear()
    this.remembered.clear()
    this.hooked.forget()
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
    if (instances === undefined) {
      // A mod may now hook a component no row is mounted for: forget every "nobody hooks this".
      this.remembered.clear()
      this.probing.clear()
      this.hooked.forget()
    } else {
      this.remembered.deleteWhere(
        (entry) => components.has(entry.component) || instances.includes(entry.instanceId)
      )
      for (const component of components) {
        this.probing.delete(component)
      }
      this.hooked.forget(components)
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

  private async run(key: string, site: Site, props: Props): Promise<void> {
    this.inFlight.add(key)
    const { generation } = this
    const { epoch } = site
    const sent = fitClaudeModsAskProps(props)
    const viewport = this.viewport
    const raw = await this.transport.request('ui_render', {
      component: site.component,
      instance_id: site.instanceId,
      props: sent,
      ...(viewport ? { viewport } : {})
    })
    this.inFlight.delete(key)
    if (generation === this.generation && epoch === site.epoch) {
      this.adopt(key, site, raw, { props, sent, hadViewport: viewport !== null })
    }
    this.pump()
  }

  private adopt(
    key: string,
    site: Site,
    raw: unknown,
    asked: { props: Props; sent: Props; hadViewport: boolean }
  ): void {
    const { component } = site
    this.probing.delete(component)
    const read = readClaudeModsSiteAnswer(raw)
    if (!read) {
      // No usable reply is this row's loss alone, unless the CLI keeps failing for the component.
      if (this.hooked.failed(component)) {
        this.markUnhooked(component, null)
      }
      return
    }
    this.hooked.answered(component)
    this.hooked.set(component, read.hooked)
    if (!read.hooked) {
      this.markUnhooked(component, site)
    }
    if (this.sites.get(key) === site) {
      const wanted = site.ask
      const outdated = wanted !== null && !claudeModsPropsEqual(wanted, asked.props)
      const heldFits =
        outdated &&
        site.answer &&
        site.answeredProps &&
        claudeModsPropsEqual(site.answeredProps, wanted)
      if (!heldFits) {
        site.answer = {
          ...read,
          props: restoreClaudeModsCutStrings(read.props, asked.props, asked.sent)
        }
        site.answeredProps = asked.props
        site.noViewport = !asked.hadViewport
        this.notify(site)
      }
      // The reply was for props the row no longer wants.
      if (outdated || (site.noViewport && this.viewport && read.hooked)) {
        this.enqueue(key)
      }
    }
  }

  /** The component's other sites need no answer: they draw core's own. */
  private markUnhooked(component: string, except: Site | null): void {
    this.hooked.set(component, false)
    this.remembered.deleteWhere((entry) => entry.component === component)
    for (const [siteKey, other] of this.sites) {
      if (other.component === component) {
        this.queue.delete(siteKey)
        if (other !== except && other.answer) {
          other.answer = null
          this.notify(other)
        }
      }
    }
  }

  private notify(site: Site): void {
    for (const watcher of site.watchers) {
      watcher()
    }
  }
}
