// A surface module's drawing as its runtime exported it: one JSON text the worker produced from
// untrusted code. It is parsed and bounded here, then rebuilt into the `ui_render` wire shape
// so the ordinary element reader and renderer draw it; each `held` closure handle becomes a
// press the Client region routes back into its frame.

import { readClaudeModsTree, type ClaudeModsNode } from '../claude-mods-tree'
import type { ClaudeModsClientLimits } from './claude-mods-client-bundle'

/** The elements a surface module can draw (its runtime's table, plus a bare `Svg`). */
const CLIENT_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'Box',
  'Text',
  'Button',
  'Input',
  'Select',
  'Link',
  'Code',
  'Markdown',
  'Svg'
])
const PRESSABLE_TYPES: ReadonlySet<string> = new Set(['Button', 'Input', 'Select'])

export type ClaudeModsClientDrawn =
  | { ok: true; tree: ClaudeModsNode; handles: number[] }
  | { ok: false; reason: string }

class TreeProblem extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function refuse(problem: string): never {
  throw new TreeProblem(problem)
}

type Walk = { plugin: string; limits: ClaudeModsClientLimits; nodes: number; handles: number[] }

function rebuild(value: unknown, depth: number, walk: Walk): unknown {
  if (typeof value === 'string') {
    return value
  }
  if (!isRecord(value)) {
    return refuse('a child that is neither a string nor an element')
  }
  walk.nodes += 1
  if (walk.nodes > walk.limits.nodes) {
    refuse(`a tree of more than ${walk.limits.nodes} nodes`)
  }
  if (depth > walk.limits.depth) {
    refuse(`a tree deeper than ${walk.limits.depth}`)
  }
  const type = value.type
  if (typeof type !== 'string' || !CLIENT_ELEMENT_TYPES.has(type)) {
    refuse(`an element ${typeof type === 'string' ? type : 'without a type'}`)
  }
  const node: Record<string, unknown> = { type }
  if (isRecord(value.props)) {
    node.props = value.props
  }
  if (isRecord(value.hover)) {
    node.hover = value.hover
    // A scoped hover lights a group of the drawing plugin's own; two plugins never share one.
    if (typeof value.hover.scope === 'string') {
      node.group = { plugin: walk.plugin }
    }
  }
  if (PRESSABLE_TYPES.has(type)) {
    const held = value.held
    if (typeof held !== 'number' || !Number.isSafeInteger(held) || held <= 0) {
      refuse(`a ${type} without its handler`)
    }
    walk.handles.push(held)
    node.press = { plugin: walk.plugin, handle: held }
  }
  if (Array.isArray(value.children)) {
    node.children = value.children.map((child) => rebuild(child, depth + 1, walk))
  }
  return node
}

/** One render's JSON text as drawable nodes and the handles it holds, or why it is refused. */
export function readClaudeModsClientTree(
  text: string,
  plugin: string,
  limits: ClaudeModsClientLimits
): ClaudeModsClientDrawn {
  if (text.length > limits.chars) {
    return { ok: false, reason: `a tree serializing to more than ${limits.chars} characters` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'returned a tree that does not validate (not JSON)' }
  }
  const walk: Walk = { plugin, limits, nodes: 0, handles: [] }
  try {
    const wire = rebuild(parsed, 0, walk)
    const rooted = isRecord(wire) ? { ...wire, part: { plugin } } : wire
    return { ok: true, tree: readClaudeModsTree(rooted), handles: walk.handles }
  } catch (error) {
    if (error instanceof TreeProblem) {
      return { ok: false, reason: `returned a tree that does not validate (${error.message})` }
    }
    throw error
  }
}
