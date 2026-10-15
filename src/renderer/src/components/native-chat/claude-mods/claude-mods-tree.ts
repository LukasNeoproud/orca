// The plain-data tree a mod's `ui.render` hook returned, read defensively: the CLI validated
// it, but its element table can grow before Orca learns a new node, and a malformed node must
// draw nothing rather than take the chat down.

import { markMonospaceTexts, markMultilineMonospace } from './claude-mods-text-heuristics'

export type ClaudeModsPress = { plugin: string; handle: number }

export type ClaudeModsElementType =
  | 'Box'
  | 'Text'
  | 'div'
  | 'span'
  | 'b'
  | 'Button'
  | 'Input'
  | 'Select'
  | 'Link'
  | 'Code'
  | 'Markdown'
  | 'Svg'
  | 'Client'

export type ClaudeModsNode =
  | { kind: 'text'; text: string }
  | {
      kind: 'element'
      type: ClaudeModsElementType
      props: Record<string, unknown>
      children: ClaudeModsNode[]
      press?: ClaudeModsPress
      /** The mod whose drawing starts here, as the engine stamped it. */
      plugin?: string
      /** The mod that drew this node: its `part`, else the nearest one above, else its `press`. */
      owner?: string
      /** Style overrides while the pointer is over its hover context; plain data. */
      hover?: Record<string, unknown>
      /** The mod whose hover group `hover.scope` names. */
      group?: string
    }
  /** Core's own drawing: meaningful only at transcript sites, so panes and the band skip it. */
  | { kind: 'engine'; ref: number }

const ELEMENT_TYPES: ReadonlySet<string> = new Set<ClaudeModsElementType>([
  'Box',
  'Text',
  'div',
  'span',
  'b',
  'Button',
  'Input',
  'Select',
  'Link',
  'Code',
  'Markdown',
  'Svg',
  'Client'
])

/** Above the terminal's own bounds; a deeper or larger tree is not one a mod meant to draw. */
const MAX_DEPTH = 64
const MAX_NODES = 5_000
const MAX_NEWLINES = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPress(value: unknown): ClaudeModsPress | undefined {
  return isRecord(value) &&
    typeof value.plugin === 'string' &&
    typeof value.handle === 'number' &&
    Number.isInteger(value.handle)
    ? { plugin: value.plugin, handle: value.handle }
    : undefined
}

function isElementType(type: string): type is ClaudeModsElementType {
  return ELEMENT_TYPES.has(type)
}

/** One `ui_render` answer's `tree` as nodes; never throws. */
export function readClaudeModsTree(value: unknown): ClaudeModsNode {
  const budget = { nodes: 0, exceeded: false }
  const nodes = readNodes(value, 0, budget)
  if (budget.exceeded) {
    warnOnce('tree too large')
    return { kind: 'text', text: '' }
  }
  const [only] = nodes
  if (nodes.length === 1 && only) {
    return only
  }
  // A dropped or unknown root left several nodes or none: one Box holds them for the site.
  return nodes.length === 0
    ? { kind: 'text', text: '' }
    : { kind: 'element', type: 'Box', props: {}, children: nodes }
}

const warned = new Set<string>()

function warnOnce(what: string): void {
  if (!warned.has(what)) {
    warned.add(what)
    console.warn(`[claude-mods] not drawing: ${what}`)
  }
}

/** A newline's `count` lines, the way Ink repeats it. */
function newlines(props: Record<string, unknown>): string {
  const count = propNumber(props, 'count')
  return '\n'.repeat(
    count === undefined ? 1 : Math.min(Math.max(Math.trunc(count), 1), MAX_NEWLINES)
  )
}

/**
 * A node as the nodes it draws: an element is itself, an unknown type is its children without
 * the wrapper, and a malformed node is nothing. Splicing keeps every Button and engine slot
 * under an unknown wrapper visible to the walkers over the tree.
 */
function readNodes(
  value: unknown,
  depth: number,
  budget: { nodes: number; exceeded: boolean },
  inherited?: string
): ClaudeModsNode[] {
  budget.nodes += 1
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) {
    budget.exceeded = true
    return []
  }
  if (typeof value === 'string') {
    return [{ kind: 'text', text: value }]
  }
  if (typeof value === 'number') {
    return [{ kind: 'text', text: String(value) }]
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    warnOnce('malformed node')
    return []
  }
  if (value.type === 'engine') {
    return [
      {
        kind: 'engine',
        ref: typeof value.ref === 'number' && Number.isInteger(value.ref) ? value.ref : 0
      }
    ]
  }
  const props = isRecord(value.props) ? value.props : {}
  if (value.type === 'Newline') {
    return [{ kind: 'text', text: newlines(props) }]
  }
  // Children ride beside props on the wire; a mod's own `props.children` never reaches here.
  const rawChildren = Array.isArray(value.children) ? value.children : []
  const press = readPress(value.press)
  // A Client names its plugin in `client`, not `part`: the surface module it runs is that plugin's.
  const client =
    value.type === 'Client' && isRecord(value.client) && typeof value.client.plugin === 'string'
      ? value.client.plugin
      : undefined
  const part =
    client ??
    (isRecord(value.part) && typeof value.part.plugin === 'string' ? value.part.plugin : undefined)
  const owner = part ?? inherited ?? press?.plugin
  const children = rawChildren.flatMap((child) => readNodes(child, depth + 1, budget, owner))
  if (!isElementType(value.type)) {
    warnOnce(`unknown type ${value.type}`)
    return children
  }
  const hover = isRecord(value.hover) ? value.hover : undefined
  const group =
    isRecord(value.group) && typeof value.group.plugin === 'string' ? value.group.plugin : undefined
  const node: ClaudeModsNode = {
    kind: 'element',
    type: value.type,
    props,
    children: value.type === 'Box' && isColumn(props) ? markMonospaceTexts(children) : children,
    ...(press ? { press } : {}),
    ...(part ? { plugin: part } : {}),
    ...(owner ? { owner } : {}),
    ...(hover ? { hover } : {}),
    ...(group ? { group } : {})
  }
  return [value.type === 'Text' ? markMultilineMonospace(node) : node]
}

function isColumn(props: Record<string, unknown>): boolean {
  return props.flexDirection === 'column' || props.flexDirection === 'column-reverse'
}

export function propString(props: Record<string, unknown>, name: string): string | undefined {
  const value = props[name]
  return typeof value === 'string' ? value : undefined
}

export function propNumber(props: Record<string, unknown>, name: string): number | undefined {
  const value = props[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function propTrue(props: Record<string, unknown>, name: string): boolean {
  return props[name] === true
}

export type ClaudeModsSelectOption = { value: string; label: string }

export function readSelectOptions(props: Record<string, unknown>): ClaudeModsSelectOption[] {
  const options = Array.isArray(props.options) ? props.options : []
  return options.flatMap((option) =>
    isRecord(option) && typeof option.value === 'string'
      ? [
          {
            value: option.value,
            label: typeof option.label === 'string' ? option.label : option.value
          }
        ]
      : []
  )
}

/** Every Button's hotkey in drawing order; on two Buttons for one key the later wins. */
export function collectClaudeModsHotkeys(
  node: ClaudeModsNode,
  into = new Map<string, { press: ClaudeModsPress; key: string | undefined }>()
): Map<string, { press: ClaudeModsPress; key: string | undefined }> {
  if (node.kind !== 'element') {
    return into
  }
  const hotkey = propString(node.props, 'hotkey')
  if (node.type === 'Button' && node.press && hotkey) {
    into.set(hotkey.toLowerCase(), { press: node.press, key: propString(node.props, 'key') })
  }
  for (const child of node.children) {
    collectClaudeModsHotkeys(child, into)
  }
  return into
}

/** React keys for siblings: a mod's own `key` where it gave one, else kind and ordinal. */
export function keyedClaudeModsChildren(nodes: ClaudeModsNode[]): [string, ClaudeModsNode][] {
  const seen = new Map<string, number>()
  return nodes.map((node) => {
    const own = node.kind === 'element' ? propString(node.props, 'key') : undefined
    const kind = node.kind === 'element' ? node.type : node.kind
    const base = own === undefined ? kind : `${kind}#${own}`
    const ordinal = seen.get(base) ?? 0
    seen.set(base, ordinal + 1)
    return [`${base}:${ordinal}`, node]
  })
}

/** A `ui_render` answer's `client_modules`: each plugin's surface-module hash, strings only. */
export function readClaudeModsClientModules(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
