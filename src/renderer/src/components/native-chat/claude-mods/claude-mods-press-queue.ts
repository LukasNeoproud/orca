// Presses, typing and picks a drawn tree sends back, paced as Claude Desktop paces them: a press
// still in flight is not sent twice, a press on a superseded drawing goes to the newest handle
// for the same unique key, `change`s fold to the latest and `submit`s and picks keep their order.

import { propString, type ClaudeModsNode, type ClaudeModsPress } from './claude-mods-tree'

export type ClaudeModsActSubtype = 'ui_press' | 'ui_input' | 'ui_select'

type Send = (subtype: ClaudeModsActSubtype, fields: Record<string, unknown>) => Promise<unknown>

/** One render site's acts: where they heal a stale handle and what a refused one triggers. */
export type ClaudeModsActSite = {
  /** Unique across the chat's sites, e.g. `component\0instance`. */
  id: string
  /** The site's newest tree, once a drawing in flight has landed; undefined when none is held. */
  latest: () => Promise<ClaudeModsNode | undefined> | ClaudeModsNode | undefined
  /** The engine ran nothing: the tree on screen is stale. */
  onRetired: () => void
}

type Job = { coalesces: boolean; run: () => Promise<void>; done: () => void }

/** Elements whose press the engine finds again by key; others keep the handle they were drawn with. */
const REBASED_TYPES: ReadonlySet<string> = new Set(['Button', 'Markdown'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const pressIdentity = (press: ClaudeModsPress, key?: string, href?: string): string =>
  `${press.plugin}\0${press.handle}\0${key ?? ''}\0${href ?? ''}`

// null marks a key two elements of one plugin share: it names no single press.
const pressIndexes = new WeakMap<object, Map<string, ClaudeModsPress | null>>()

function indexPresses(node: ClaudeModsNode, into: Map<string, ClaudeModsPress | null>): void {
  if (node.kind !== 'element') {
    return
  }
  const key = propString(node.props, 'key')
  if (node.press && key !== undefined && REBASED_TYPES.has(node.type)) {
    const id = `${node.press.plugin}\0${key}`
    into.set(id, into.has(id) ? null : node.press)
  }
  for (const child of node.children) {
    indexPresses(child, into)
  }
}

/** The press `tree` draws for the plugin's key, when exactly one Button or Markdown carries it. */
export function claudeModsCurrentPress(
  tree: ClaudeModsNode,
  plugin: string,
  key: string
): ClaudeModsPress | undefined {
  let index = pressIndexes.get(tree)
  if (!index) {
    index = new Map()
    indexPresses(tree, index)
    pressIndexes.set(tree, index)
  }
  return index.get(`${plugin}\0${key}`) ?? undefined
}

export class ClaudeModsPressQueue {
  private readonly pressing = new Set<string>()
  private readonly lanes = new Map<string, Job[]>()

  constructor(private readonly send: Send) {}

  press(site: ClaudeModsActSite, press: ClaudeModsPress, key?: string, href?: string): void {
    const original = pressIdentity(press, key, href)
    if (this.pressing.has(original)) {
      return
    }
    const owned = [original]
    this.pressing.add(original)
    void (async () => {
      try {
        const tree = key === undefined ? undefined : await site.latest()
        const current = (tree && key && claudeModsCurrentPress(tree, press.plugin, key)) || press
        const rebased = pressIdentity(current, key, href)
        if (rebased !== original) {
          // A click on the old drawing and one on the new reach the same element.
          if (this.pressing.has(rebased)) {
            return
          }
          owned.push(rebased)
          this.pressing.add(rebased)
        }
        await this.act(site, 'ui_press', {
          ...current,
          ...(key ? { key } : {}),
          ...(href ? { href } : {})
        })
      } finally {
        for (const identity of owned) {
          this.pressing.delete(identity)
        }
      }
    })()
  }

  /** Typing or a pick, in order per field; a `change` waiting behind another one replaces it. */
  queue(
    site: ClaudeModsActSite,
    subtype: 'ui_input' | 'ui_select',
    target: { press: ClaudeModsPress; key: string | undefined },
    coalesces: boolean,
    fields: Record<string, unknown>
  ): Promise<void> {
    const lane = `${site.id}\0${target.press.plugin}\0${target.key ?? `#${target.press.handle}`}`
    return new Promise((done) => {
      const jobs = this.lanes.get(lane) ?? []
      const last = jobs.at(-1)
      if (coalesces && last?.coalesces) {
        jobs.pop()
        last.done()
      }
      jobs.push({ coalesces, run: () => this.act(site, subtype, fields), done })
      if (!this.lanes.has(lane)) {
        this.lanes.set(lane, jobs)
        void this.drain(lane, jobs)
      }
    })
  }

  private async drain(lane: string, jobs: Job[]): Promise<void> {
    try {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        try {
          await job.run()
        } finally {
          job.done()
        }
      }
    } finally {
      this.lanes.delete(lane)
    }
  }

  private async act(
    site: ClaudeModsActSite,
    subtype: ClaudeModsActSubtype,
    fields: Record<string, unknown>
  ): Promise<void> {
    const answer = await this.send(subtype, fields)
    if (isRecord(answer) && answer.handled === false) {
      site.onRetired()
    }
  }
}

const transportQueues = new WeakMap<object, ClaudeModsPressQueue>()

/** One queue per transport, so every dispatch built on it shares the in-flight presses. */
export function claudeModsPressQueueFor(transport: {
  request: (subtype: ClaudeModsActSubtype, fields: Record<string, unknown>) => Promise<unknown>
}): ClaudeModsPressQueue {
  let queue = transportQueues.get(transport)
  if (!queue) {
    queue = new ClaudeModsPressQueue((subtype, fields) => transport.request(subtype, fields))
    transportQueues.set(transport, queue)
  }
  return queue
}
