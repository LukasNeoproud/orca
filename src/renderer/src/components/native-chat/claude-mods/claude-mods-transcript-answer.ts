import {
  readClaudeModsClientModules,
  readClaudeModsTree,
  type ClaudeModsNode
} from './claude-mods-tree'

/** One `ui_render` answer for a transcript site, read defensively. */
export type ClaudeModsSiteAnswer = {
  tree: ClaudeModsNode
  /** What the first rewritten engine node draws with. */
  props: Record<string, unknown>
  rewritten: boolean
  hooked: boolean
  clientModules?: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readClaudeModsSiteAnswer(value: unknown): ClaudeModsSiteAnswer | null {
  if (!isRecord(value) || value.tree === undefined) {
    return null
  }
  const clientModules = readClaudeModsClientModules(value.client_modules)
  return {
    tree: readClaudeModsTree(value.tree),
    props: isRecord(value.props) ? value.props : {},
    rewritten: value.rewritten === true,
    hooked: value.hooked !== false,
    ...(clientModules ? { clientModules } : {})
  }
}

function preorder(node: ClaudeModsNode, out: ClaudeModsNode[]): void {
  out.push(node)
  if (node.kind === 'element') {
    for (const child of node.children) {
      preorder(child, out)
    }
  }
}

/**
 * AskUserQuestion's tree rule: core's dialog is drawn by exactly one engine node and nothing
 * follows it in document order; anything else draws core's dialog alone.
 */
export function isClaudeModsQuestionTree(tree: ClaudeModsNode): boolean {
  const nodes: ClaudeModsNode[] = []
  preorder(tree, nodes)
  const engineAt = nodes.flatMap((node, index) => (node.kind === 'engine' ? [index] : []))
  return engineAt.length === 1 && engineAt[0] === nodes.length - 1
}

/** A tree that is only core's own drawing: nothing for a mod to add. */
export function isClaudeModsEngineOnly(
  tree: ClaudeModsNode
): tree is { kind: 'engine'; ref: number } {
  return tree.kind === 'engine'
}

/**
 * `tree` with its first engine node, in document order, marked as the one Orca's own drawing
 * sits in: its ref `r` becomes `-1 - r`. The mark lets the site keep that drawing mounted in one
 * place while the tree around it changes. `ref` is the unmarked ref, null without an engine node.
 */
export function markClaudeModsPrimaryEngine(tree: ClaudeModsNode): {
  tree: ClaudeModsNode
  ref: number | null
} {
  let ref: number | null = null
  const mark = (node: ClaudeModsNode): ClaudeModsNode | null => {
    if (node.kind === 'engine') {
      ref = node.ref
      return { kind: 'engine', ref: -1 - node.ref }
    }
    if (node.kind !== 'element') {
      return null
    }
    for (const [index, child] of node.children.entries()) {
      const marked = mark(child)
      if (marked) {
        return { ...node, children: node.children.map((c, i) => (i === index ? marked : c)) }
      }
    }
    return null
  }
  return { tree: mark(tree) ?? tree, ref }
}
