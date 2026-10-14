// What the band does to a mod's tree before drawing it: dismiss Buttons leave for a close
// control, the root loses its vertical margins, and a tree with nothing to see draws no band.

import { propString, type ClaudeModsNode } from './claude-mods-tree'

type ElementNode = Extract<ClaudeModsNode, { kind: 'element' }>

export type ShapedClaudeModsBand = {
  tree: ClaudeModsNode
  /** The `role: "dismiss"` Buttons, in drawing order. */
  dismiss: ElementNode[]
  visible: boolean
}

const VERTICAL_MARGINS = ['margin', 'marginY', 'marginTop', 'marginBottom'] as const
const PAINTED_BOX_PROPS = ['backgroundColor', 'borderStyle'] as const
const ALWAYS_VISIBLE = new Set(['Button', 'Input', 'Select', 'Svg', 'Client', 'Code'])

function isDismiss(node: ClaudeModsNode): node is ElementNode {
  return node.kind === 'element' && node.type === 'Button' && node.props.role === 'dismiss'
}

function liftDismiss(node: ClaudeModsNode, into: ElementNode[]): ClaudeModsNode {
  if (node.kind !== 'element') {
    return node
  }
  const children: ClaudeModsNode[] = []
  for (const child of node.children) {
    if (isDismiss(child)) {
      into.push(child)
    } else {
      children.push(liftDismiss(child, into))
    }
  }
  return { ...node, children }
}

/** A root margin that sets both axes keeps its horizontal half. */
function stripRootVerticalMargins(node: ClaudeModsNode): ClaudeModsNode {
  if (node.kind !== 'element') {
    return node
  }
  const props = { ...node.props }
  if (props.margin !== undefined && props.marginX === undefined) {
    props.marginX = props.margin
  }
  for (const name of VERTICAL_MARGINS) {
    delete props[name]
  }
  return { ...node, props }
}

/** Whether the node paints anything: text, a control, a graphic, or a painted Box. */
export function hasVisibleClaudeModsContent(node: ClaudeModsNode): boolean {
  if (node.kind === 'text') {
    return node.text.trim() !== ''
  }
  if (node.kind !== 'element') {
    return false
  }
  if (ALWAYS_VISIBLE.has(node.type)) {
    return true
  }
  if (node.type === 'Markdown') {
    return (propString(node.props, 'text') ?? '').trim() !== ''
  }
  if (node.type === 'Link' && (propString(node.props, 'label') ?? propString(node.props, 'href'))) {
    return true
  }
  if (
    (node.type === 'Box' || node.type === 'div') &&
    PAINTED_BOX_PROPS.some((name) => node.props[name] !== undefined)
  ) {
    return true
  }
  return node.children.some(hasVisibleClaudeModsContent)
}

export function shapeClaudeModsBand(tree: ClaudeModsNode): ShapedClaudeModsBand {
  const dismiss: ElementNode[] = []
  // A root that is itself a dismiss Button leaves nothing else to draw.
  const lifted: ClaudeModsNode = isDismiss(tree)
    ? { kind: 'text', text: '' }
    : liftDismiss(tree, dismiss)
  if (isDismiss(tree)) {
    dismiss.push(tree)
  }
  const shaped = stripRootVerticalMargins(lifted)
  return { tree: shaped, dismiss, visible: hasVisibleClaudeModsContent(shaped) }
}
