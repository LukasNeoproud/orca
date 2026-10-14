// A node's `hover` object as style overrides. The engine validated it; these rules hold the line
// anyway so a hover can never reflow a sibling: it reveals, recolours or moves a placed Box only.

import type { CSSProperties } from 'react'
import { claudeModsBoxStyle, claudeModsTextStyle } from './claude-mods-style'

export type ClaudeModsHover = Record<string, unknown>

const BOX_KEYS = ['borderColor', 'borderDimColor', 'backgroundColor'] as const
const OFFSET_KEYS = ['top', 'left', 'right', 'bottom'] as const
const TEXT_KEYS = [
  'color',
  'backgroundColor',
  'dimColor',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'inverse'
] as const
const MAX_OFFSET = 10_000

export function readClaudeModsHover(value: unknown): ClaudeModsHover | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined
}

/** The hover's scope when it names a group. */
export function claudeModsHoverScope(hover: ClaudeModsHover | undefined): string | undefined {
  const scope = hover?.scope
  return typeof scope === 'string' && scope.length > 0 && scope.length <= 64 ? scope : undefined
}

/** A Text's or Button label's props with the hover's colours and styles on top. */
export function claudeModsHoveredTextProps(
  props: Record<string, unknown>,
  hover: ClaudeModsHover | undefined
): Record<string, unknown> {
  if (!hover) {
    return props
  }
  const merged = { ...props }
  for (const name of TEXT_KEYS) {
    if (hover[name] !== undefined) {
      merged[name] = hover[name]
    }
  }
  return merged
}

/** A Box's props with the hover applied; `revealed` when it turned a hidden Box on. */
export function claudeModsHoveredBoxProps(
  props: Record<string, unknown>,
  hover: ClaudeModsHover | undefined
): { props: Record<string, unknown>; revealed: boolean } {
  if (!hover) {
    return { props, revealed: false }
  }
  const merged = { ...props }
  for (const name of BOX_KEYS) {
    if (hover[name] !== undefined) {
      merged[name] = hover[name]
    }
  }
  // A hover cannot add a border: that would move what is around the Box.
  if (typeof props.borderStyle === 'string' && typeof hover.borderStyle === 'string') {
    merged.borderStyle = hover.borderStyle
  }
  const revealed = hover.display === 'flex' && props.display === 'none'
  if (revealed) {
    merged.display = 'flex'
  }
  if (props.position === 'absolute') {
    for (const name of OFFSET_KEYS) {
      const offset = hover[name]
      if (typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) <= MAX_OFFSET) {
        merged[name] = Math.trunc(offset)
      }
    }
  }
  return { props: merged, revealed }
}

const BORDER_SIDES = ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'] as const

/** A lit border changes style and colour only: a wider one (double, bold) would shift siblings. */
function withRestingBorderWidth(lit: CSSProperties, resting: CSSProperties): CSSProperties {
  const result = { ...lit }
  for (const side of BORDER_SIDES) {
    const litBorder = lit[side]
    const restingBorder = resting[side]
    const width = typeof restingBorder === 'string' ? restingBorder.split(' ')[0] : undefined
    if (typeof litBorder === 'string' && width) {
      result[side] = `${width} ${litBorder.split(' ').slice(1).join(' ')}`
    }
  }
  return result
}

/** A Box's style while lit; a reveal is taken out of the flow so no sibling moves for it. */
export function claudeModsHoveredBoxStyle(
  props: Record<string, unknown>,
  hover: ClaudeModsHover | undefined,
  lit: boolean
): CSSProperties {
  if (!lit) {
    return claudeModsBoxStyle(props)
  }
  const hovered = claudeModsHoveredBoxProps(props, hover)
  const style = withRestingBorderWidth(claudeModsBoxStyle(hovered.props), claudeModsBoxStyle(props))
  return hovered.revealed && props.position !== 'absolute'
    ? { ...style, position: 'absolute' }
    : style
}

export function claudeModsHoveredTextStyle(
  props: Record<string, unknown>,
  hover: ClaudeModsHover | undefined,
  lit: boolean,
  content?: string
): CSSProperties {
  return claudeModsTextStyle(lit ? claudeModsHoveredTextProps(props, hover) : props, content)
}
