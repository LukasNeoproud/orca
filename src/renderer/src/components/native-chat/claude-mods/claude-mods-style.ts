// Ink-style layout and text props, in cells and theme keys, as CSS for Orca's chat.
// A mod sizes in character cells of a monospace font; these map onto the chat's own units
// so a pane scales with the chat's text size setting.

import type { CSSProperties } from 'react'
import { propNumber, propString, propTrue } from './claude-mods-tree'

/** One cell across and one row down, in the chat's scaled units. */
const CELL_X = '0.6em'
const CELL_Y = '1.4em'

// desktop and mobile also take a spacing step name.
const STEPS: Record<string, string> = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem'
}

// Claude Code theme keys onto the chat's tokens, so a mod reads right in light and dark.
const FOREGROUND = 'var(--chat-foreground)'
const CANVAS = 'var(--chat-canvas)'
const FAINT = 'var(--chat-foreground-faint)'
const HAIRLINE = 'var(--chat-code-border)'
const ADDED = 'var(--chat-diff-added)'
const REMOVED = 'var(--chat-diff-removed)'
const WARNING = 'var(--chat-warning)'
const STRONG = 'var(--chat-foreground-strong)'
const THEME_COLORS: Record<string, string> = {
  text: FOREGROUND,
  inverseText: CANVAS,
  background: CANVAS,
  inactive: FAINT,
  subtle: FAINT,
  secondaryText: FAINT,
  secondaryBorder: HAIRLINE,
  success: ADDED,
  diffAdded: ADDED,
  diffAddedDimmed: ADDED,
  error: REMOVED,
  diffRemoved: REMOVED,
  diffRemovedDimmed: REMOVED,
  warning: WARNING,
  warningShimmer: WARNING,
  claude: STRONG,
  permission: STRONG,
  planMode: STRONG,
  promptBorder: STRONG,
  suggestion: STRONG,
  remember: STRONG,
  ide: STRONG,
  autoAccept: STRONG,
  fastMode: STRONG,
  bashBorder: STRONG,
  // Ink's ANSI names, which mods reach for as often as theme keys.
  red: REMOVED,
  green: ADDED,
  yellow: WARNING,
  gray: FAINT,
  grey: FAINT,
  white: FOREGROUND,
  black: FOREGROUND
}

const CSS_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]{3,20})$/i

/** A theme key, an ANSI name or a plain CSS color; anything else draws in the default. */
export function claudeModsColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return THEME_COLORS[value] ?? (CSS_COLOR.test(value) ? value : undefined)
}

function cellsX(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `calc(${value} * ${CELL_X})`
  }
  return typeof value === 'string' ? (STEPS[value] ?? percent(value)) : undefined
}

function cellsY(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `calc(${value} * ${CELL_Y})`
  }
  return typeof value === 'string' ? (STEPS[value] ?? percent(value)) : undefined
}

function percent(value: string): string | undefined {
  return /^\d{1,3}(\.\d+)?%$/.test(value) ? value : undefined
}

function compact(style: Record<string, string | number | undefined>): CSSProperties {
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined))
}

const BORDER_STYLES: Record<string, string> = {
  double: 'double',
  doubleSingle: 'double',
  singleDouble: 'double',
  bold: 'solid',
  classic: 'dashed',
  arrow: 'solid'
}

function borderStyle(props: Record<string, unknown>): CSSProperties {
  const style = propString(props, 'borderStyle')
  if (!style) {
    return {}
  }
  const color =
    props.borderDimColor === true ? HAIRLINE : (claudeModsColor(props.borderColor) ?? HAIRLINE)
  const line = `${style === 'bold' || style.startsWith('double') ? 2 : 1}px ${BORDER_STYLES[style] ?? 'solid'} ${color}`
  const side = (name: string): string | undefined => (props[name] === false ? undefined : line)
  return compact({
    borderTop: side('borderTop'),
    borderBottom: side('borderBottom'),
    borderLeft: side('borderLeft'),
    borderRight: side('borderRight'),
    borderRadius: style === 'round' ? '0.5rem' : '0.125rem'
  })
}

export function claudeModsBoxStyle(props: Record<string, unknown>): CSSProperties {
  const paddingX = props.paddingX ?? props.padding
  const paddingY = props.paddingY ?? props.padding
  const marginX = props.marginX ?? props.margin
  const marginY = props.marginY ?? props.margin
  const absolute = props.position === 'absolute'
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
      rowGap: cellsY(props.rowGap ?? props.gap),
      paddingTop: cellsY(props.paddingTop ?? paddingY),
      paddingBottom: cellsY(props.paddingBottom ?? paddingY),
      paddingLeft: cellsX(props.paddingLeft ?? paddingX),
      paddingRight: cellsX(props.paddingRight ?? paddingX),
      marginTop: cellsY(props.marginTop ?? marginY),
      marginBottom: cellsY(props.marginBottom ?? marginY),
      marginLeft: cellsX(props.marginLeft ?? marginX),
      marginRight: cellsX(props.marginRight ?? marginX),
      width: cellsX(props.width),
      height: cellsY(props.height),
      minWidth: cellsX(props.minWidth) ?? 0,
      minHeight: cellsY(props.minHeight),
      maxWidth: cellsX(props.maxWidth),
      maxHeight: cellsY(props.maxHeight),
      overflow: propString(props, 'overflow') === 'hidden' ? 'hidden' : undefined,
      backgroundColor: claudeModsColor(props.backgroundColor),
      position: absolute ? 'absolute' : undefined,
      top: absolute ? cellsY(props.top) : undefined,
      bottom: absolute ? cellsY(props.bottom) : undefined,
      left: absolute ? cellsX(props.left) : undefined,
      right: absolute ? cellsX(props.right) : undefined
    }),
    ...borderStyle(props)
  }
}

const WEIGHTS: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }

export function claudeModsTextStyle(props: Record<string, unknown>): CSSProperties {
  const inverse = propTrue(props, 'inverse')
  const color = claudeModsColor(props.color)
  const background = claudeModsColor(props.backgroundColor)
  const wrap = propString(props, 'wrap') ?? 'wrap'
  const truncates = wrap.startsWith('truncate')
  const decorations = [
    propTrue(props, 'underline') ? 'underline' : '',
    propTrue(props, 'strikethrough') ? 'line-through' : ''
  ].filter(Boolean)
  const weight = propString(props, 'weight')
  return compact({
    color: inverse ? (background ?? 'var(--chat-canvas)') : color,
    backgroundColor: inverse ? (color ?? 'var(--chat-foreground)') : background,
    fontWeight: weight ? WEIGHTS[weight] : propTrue(props, 'bold') ? 600 : undefined,
    fontStyle: propTrue(props, 'italic') ? 'italic' : undefined,
    textDecorationLine: decorations.length > 0 ? decorations.join(' ') : undefined,
    opacity: propTrue(props, 'dimColor') ? 0.6 : undefined,
    fontFamily: propTrue(props, 'mono') ? 'var(--font-mono)' : undefined,
    fontVariantNumeric: propTrue(props, 'tabular') ? 'tabular-nums' : undefined,
    whiteSpace: truncates ? 'nowrap' : 'pre-wrap',
    overflow: truncates ? 'hidden' : undefined,
    textOverflow: truncates ? 'ellipsis' : undefined,
    direction: wrap === 'truncate-start' ? 'rtl' : undefined,
    overflowWrap: truncates ? undefined : 'anywhere'
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
