// An Svg drawn as an image sees none of the page's CSS, so the host's text color and font ride
// on the root element: `currentColor` and text then follow the chat's theme.

export type ClaudeModsSvgInk = { color: string; fontFamily: string }

const MAX_SIDE_PX = 4096

function declares(root: Element, attribute: string): boolean {
  return (
    root.hasAttribute(attribute) ||
    new RegExp(`(^|;)\\s*${attribute}\\s*:`, 'i').test(root.getAttribute('style') ?? '')
  )
}

/** `source` with the host's `color` and `font-family` on its root where it set none. */
export function inkClaudeModsSvg(source: string, ink: ClaudeModsSvgInk): string {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (root.localName !== 'svg' || document.querySelector('parsererror')) {
    return source
  }
  if (!declares(root, 'color')) {
    root.setAttribute('color', ink.color)
  }
  if (!declares(root, 'font-family')) {
    root.setAttribute('font-family', ink.fontFamily)
  }
  return new XMLSerializer().serializeToString(root)
}

export function claudeModsSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** A drawn `width` or `height` in px, capped; anything but a positive number is left to the image. */
export function claudeModsSvgSide(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), MAX_SIDE_PX)
    : undefined
}
