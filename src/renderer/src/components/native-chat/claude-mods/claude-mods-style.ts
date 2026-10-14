// Ink-style layout and text props, in cells and theme keys, as CSS for Orca's chat.
// A mod sizes in character cells of a monospace font; these map onto the chat's own units
// so a pane scales with the chat's text size setting.

import type { CSSProperties } from 'react'
import { claudeModsColor } from './claude-mods-colors'
import { claudeModsWrapBehaviour } from './claude-mods-text-heuristics'
import { propNumber, propString, propTrue } from './claude-mods-tree'

/** One cell across, in the chat's scaled units. */
const CELL_X = '0.6em'
/** A row is a line of the chat's text; spacing takes half of one (a Client takes a whole one). */
const SPACE_ROW = 'var(--claude-mods-row-unit, 0.5lh)'
const SIZE_ROW = '1lh'

// desktop and mobile also take a spacing step name.
const STEPS: Record<string, string> = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem'
}

const BORDER = 'var(--border)'

/** Re-exported: the Box and Text styles below resolve every color through it. */
export { claudeModsColor }

function cellsX(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `calc(${value} * ${CELL_X})`
  }
  return typeof value === 'string' ? (STEPS[value] ?? percent(value)) : undefined
}

/** Padding, margin and gap run half a row; height and placement a whole one. */
function rowsAs(unit: string): (value: unknown) => string | undefined {
  return (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `calc(${value} * ${unit})`
    }
    return typeof value === 'string' ? (STEPS[value] ?? percent(value)) : undefined
  }
}

const spaceY = rowsAs(SPACE_ROW)
const sizeY = rowsAs(SIZE_ROW)

/** A placed Box's offset is a whole number of cells, negative allowed. */
function wholeCells(value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : value
}

function percent(value: string): string | undefined {
  return /^\d{1,3}(\.\d+)?%$/.test(value) ? value : undefined
}

function compact(style: Record<string, string | number | undefined>): CSSProperties {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined))
}

const DEFAULT_PADDING_Y = '0.5rem'
const DEFAULT_PADDING_X = '0.75rem'

/** Line style and width of a `borderStyle`; every name Ink knows but Desktop does not is single. */
function borderLine(style: string): { width: string; kind: string } {
  if (style === 'double') {
    return { width: '3px', kind: 'double' }
  }
  return { width: style === 'bold' ? '2px' : '1px', kind: 'solid' }
}

function borderStyle(props: Record<string, unknown>): CSSProperties {
  const style = propString(props, 'borderStyle')
  if (!style) {
    return {}
  }
  const base = claudeModsColor(props.borderColor) ?? BORDER
  const color =
    props.borderDimColor === true ? `color-mix(in srgb, ${base} 60%, transparent)` : base
  const { width, kind } = borderLine(style)
  const line = `${width} ${kind} ${color}`
  const side = (name: string): string | undefined => (props[name] === false ? undefined : line)
  return compact({
    borderTop: side('borderTop'),
    borderBottom: side('borderBottom'),
    borderLeft: side('borderLeft'),
    borderRight: side('borderRight'),
    borderRadius: style === 'round' ? 'var(--radius-lg)' : 'var(--radius-md)'
  })
}

export function claudeModsBoxStyle(props: Record<string, unknown>): CSSProperties {
  const paddingX = props.paddingX ?? props.padding
  const paddingY = props.paddingY ?? props.padding
  const marginX = props.marginX ?? props.margin
  const marginY = props.marginY ?? props.margin
  const absolute = props.position === 'absolute'
  // A bordered Box is padded unless the mod says otherwise, side by side.
  const bordered = typeof props.borderStyle === 'string' && props.borderStyle !== ''
  const fallbackY = bordered ? DEFAULT_PADDING_Y : undefined
  const fallbackX = bordered ? DEFAULT_PADDING_X : undefined
  return {
    ...compact({
      display: props.display === 'none' ? 'none' : 'flex',
      flexDirection: propString(props, 'flexDirection') ?? 'row',
      flexWrap: propString(props, 'flexWrap'),
      flexGrow: propNumber(props, 'flexGrow'),
      flexShrink: propNumber(props, 'flexShrink') ?? 1,
      flexBasis: cellsX(props.flexBasis),
      alignItems: propString(props, 'alignItems'),
      alignSelf: propString(props, 'alignSelf'),
      justifyContent: propString(props, 'justifyContent'),
      columnGap: cellsX(props.columnGap ?? props.gap),
      rowGap: spaceY(props.rowGap ?? props.gap),
      paddingTop: spaceY(props.paddingTop ?? paddingY) ?? fallbackY,
      paddingBottom: spaceY(props.paddingBottom ?? paddingY) ?? fallbackY,
      paddingLeft: cellsX(props.paddingLeft ?? paddingX) ?? fallbackX,
      paddingRight: cellsX(props.paddingRight ?? paddingX) ?? fallbackX,
      marginTop: spaceY(props.marginTop ?? marginY),
      marginBottom: spaceY(props.marginBottom ?? marginY),
      marginLeft: cellsX(props.marginLeft ?? marginX),
      marginRight: cellsX(props.marginRight ?? marginX),
      width: cellsX(props.width),
      height: sizeY(props.height),
      minWidth: cellsX(props.minWidth) ?? 0,
      minHeight: sizeY(props.minHeight),
      maxWidth: cellsX(props.maxWidth),
      maxHeight: sizeY(props.maxHeight),
      overflow: propString(props, 'overflow') === 'hidden' ? 'hidden' : undefined,
      backgroundColor: claudeModsColor(props.backgroundColor),
      // Every Box is a positioning parent, so a placed child lands against its own parent.
      position: absolute ? 'absolute' : 'relative',
      top: absolute ? sizeY(wholeCells(props.top)) : undefined,
      bottom: absolute ? sizeY(wholeCells(props.bottom)) : undefined,
      left: absolute ? cellsX(wholeCells(props.left)) : undefined,
      right: absolute ? cellsX(wholeCells(props.right)) : undefined
    }),
    ...borderStyle(props)
  }
}

const WEIGHTS: Record<string, number> = {
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700
}

// The chat has four text steps; headings stand out by weight within the reading step.
const SIZES: Record<string, { fontSize: string; fontWeight?: number }> = {
  caption: { fontSize: 'var(--text-2xs)' },
  footnote: { fontSize: 'var(--text-xs)' },
  body: { fontSize: 'var(--text-sm)' },
  heading: { fontSize: 'var(--text-sm)', fontWeight: 600 },
  title: { fontSize: 'var(--text-sm)', fontWeight: 700 }
}

/** `content` is the Text's string when every child is one; it decides how a short token wraps. */
export function claudeModsTextStyle(
  props: Record<string, unknown>,
  content?: string
): CSSProperties {
  const inverse = propTrue(props, 'inverse')
  const color = claudeModsColor(props.color)
  const background = claudeModsColor(props.backgroundColor)
  const wrap = propString(props, 'wrap') ?? 'wrap'
  const truncates = wrap !== 'wrap'
  const decorations = [
    propTrue(props, 'underline') ? 'underline' : '',
    propTrue(props, 'strikethrough') ? 'line-through' : ''
  ].filter(Boolean)
  const weight = propString(props, 'weight')
  const size = SIZES[propString(props, 'size') ?? '']
  const breaks = truncates ? undefined : claudeModsWrapBehaviour(content)
  return compact({
    fontSize: size?.fontSize,
    color: inverse ? (background ?? 'var(--chat-canvas)') : color,
    backgroundColor: inverse ? (color ?? 'var(--chat-foreground)') : background,
    fontWeight: weight ? WEIGHTS[weight] : propTrue(props, 'bold') ? 600 : size?.fontWeight,
    fontStyle: propTrue(props, 'italic') ? 'italic' : undefined,
    textDecorationLine: decorations.length > 0 ? decorations.join(' ') : undefined,
    opacity: propTrue(props, 'dimColor') ? 0.6 : undefined,
    fontFamily: propTrue(props, 'mono') ? 'var(--font-mono)' : undefined,
    fontVariantNumeric: propTrue(props, 'tabular') ? 'tabular-nums' : undefined,
    // A truncating Text is a box of its own so a flex parent can shrink it below its text.
    display: truncates ? 'inline-block' : undefined,
    maxWidth: truncates ? '100%' : undefined,
    minWidth: truncates ? 0 : undefined,
    whiteSpace: truncates ? 'pre' : (breaks?.whiteSpace ?? 'pre-wrap'),
    overflow: truncates ? 'hidden' : undefined,
    textOverflow: truncates ? 'ellipsis' : undefined,
    direction: wrap === 'truncate-start' ? 'rtl' : undefined,
    overflowWrap: truncates ? undefined : (breaks?.overflowWrap ?? 'anywhere')
  })
}

const STYLE_PROPERTY = /^[a-z-]{1,40}$/
const UNSAFE_VALUE = /url\(|expression\(|javascript:|@import/i

/** A div/span/b `style` declaration string as React style, dropping anything that fetches. */
export function claudeModsDeclarationStyle(value: unknown): CSSProperties {
  if (typeof value !== 'string') {
    return {}
  }
  const style: Record<string, string> = {}
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':')
    const name = declaration.slice(0, colon).trim().toLowerCase()
    const cssValue = declaration.slice(colon + 1).trim()
    if (colon > 0 && STYLE_PROPERTY.test(name) && cssValue && !UNSAFE_VALUE.test(cssValue)) {
      style[name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = cssValue
    }
  }
  return style
}
