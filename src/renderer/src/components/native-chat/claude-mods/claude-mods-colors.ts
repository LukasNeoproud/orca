// Claude Code theme keys and ANSI names onto the chat's tokens, so a mod reads right in light and dark.

const FOREGROUND = 'var(--chat-foreground)'
const CANVAS = 'var(--chat-canvas)'
const FAINT = 'var(--chat-foreground-faint)'
const STRONG = 'var(--chat-foreground-strong)'
const SURFACE = 'var(--chat-user-surface)'
export const CLAUDE_MODS_HAIRLINE = 'var(--chat-code-border)'
const ADDED = 'var(--chat-diff-added)'
const REMOVED = 'var(--chat-diff-removed)'
const WARNING = 'var(--chat-warning)'
const ACCENT = 'var(--chat-accent)'
const BRAND = 'var(--chat-brand)'
const PRO = 'var(--chat-pro)'
const MERGED = 'var(--chat-merged)'

const THEME_COLORS: Record<string, string> = {
  text: FOREGROUND,
  inverseText: CANVAS,
  background: CANVAS,
  clawd_background: CANVAS,
  inactive: FAINT,
  inactiveShimmer: FAINT,
  subtle: FAINT,
  secondaryText: FAINT,
  secondaryBorder: CLAUDE_MODS_HAIRLINE,
  promptBorderShimmer: CLAUDE_MODS_HAIRLINE,
  promptBorder: STRONG,
  userMessageBackground: SURFACE,
  userMessageBackgroundHover: SURFACE,
  bashMessageBackgroundColor: SURFACE,
  memoryBackgroundColor: SURFACE,
  composerSidebarBackground: SURFACE,
  success: ADDED,
  planMode: ADDED,
  diffAdded: ADDED,
  diffAddedDimmed: ADDED,
  diffAddedWord: ADDED,
  error: REMOVED,
  diffRemoved: REMOVED,
  diffRemovedDimmed: REMOVED,
  diffRemovedWord: REMOVED,
  warning: WARNING,
  warningShimmer: WARNING,
  claude: BRAND,
  claudeShimmer: BRAND,
  clawd_body: BRAND,
  briefLabelClaude: BRAND,
  orange_FOR_SUBAGENTS_ONLY: BRAND,
  permission: ACCENT,
  permissionShimmer: ACCENT,
  suggestion: ACCENT,
  remember: ACCENT,
  ide: ACCENT,
  briefLabelYou: ACCENT,
  claudeBlue_FOR_SYSTEM_SPINNER: ACCENT,
  claudeBlueShimmer_FOR_SYSTEM_SPINNER: ACCENT,
  rate_limit_fill: ACCENT,
  autoAccept: PRO,
  autoAcceptShimmer: PRO,
  skill: PRO,
  effortUltra: PRO,
  merged: MERGED,
  // Data colours: Desktop draws these as fixed hexes, so they carry no theme.
  bashBorder: '#ff0087',
  fastMode: '#ff6a00',
  fastModeShimmer: '#ff9632',
  professionalBlue: '#6a9bcc',
  chromeYellow: '#fbbc04',
  red_FOR_SUBAGENTS_ONLY: '#dc2626',
  blue_FOR_SUBAGENTS_ONLY: '#6a9bcc',
  green_FOR_SUBAGENTS_ONLY: '#16a34a',
  yellow_FOR_SUBAGENTS_ONLY: '#ca8a04',
  purple_FOR_SUBAGENTS_ONLY: '#827dbd',
  pink_FOR_SUBAGENTS_ONLY: '#c46686',
  cyan_FOR_SUBAGENTS_ONLY: '#0891b2',
  rainbow_red: '#eb5f57',
  rainbow_orange: '#f58b57',
  rainbow_yellow: '#fac35f',
  rainbow_green: '#91c882',
  rainbow_blue: '#82aadc',
  rainbow_indigo: '#9b82c8',
  rainbow_violet: '#c882b4',
  rainbow_red_shimmer: '#fa9b93',
  rainbow_orange_shimmer: '#ffb989',
  rainbow_yellow_shimmer: '#ffe19b',
  rainbow_green_shimmer: '#b9e6b4',
  rainbow_blue_shimmer: '#b4cdf0',
  rainbow_indigo_shimmer: '#c3b4e6',
  rainbow_violet_shimmer: '#e6b4d2'
}

// Ink's ANSI names, which mods reach for as often as theme keys; bright forms share the hue.
const ANSI_COLORS: Record<string, string> = {
  black: FOREGROUND,
  blackBright: FAINT,
  red: REMOVED,
  redBright: REMOVED,
  green: ADDED,
  greenBright: ADDED,
  yellow: WARNING,
  yellowBright: WARNING,
  blue: ACCENT,
  blueBright: ACCENT,
  cyan: ACCENT,
  cyanBright: ACCENT,
  magenta: PRO,
  magentaBright: PRO,
  white: FOREGROUND,
  whiteBright: FOREGROUND,
  gray: FAINT,
  grey: FAINT
}

const CSS_COLOR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([\d\s.,%/]+\))$/i

function lookup(table: Record<string, string>, name: string): string | undefined {
  return Object.hasOwn(table, name) ? table[name] : undefined
}

/** A theme key, an ANSI name, or a hex/rgb/hsl color; anything else draws in the default. */
export function claudeModsColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return (
    lookup(THEME_COLORS, value) ??
    lookup(ANSI_COLORS, value.startsWith('ansi:') ? value.slice(5) : value) ??
    (CSS_COLOR.test(value) ? value : undefined)
  )
}
