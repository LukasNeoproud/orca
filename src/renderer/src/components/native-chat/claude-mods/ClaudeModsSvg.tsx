import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNativeChatVisualTheme } from '../use-native-chat-visual-theme'
import {
  claudeModsSvgDataUrl,
  claudeModsSvgSide,
  inkClaudeModsSvg,
  type ClaudeModsSvgInk
} from './claude-mods-svg-source'
import { propString } from './claude-mods-tree'

/**
 * Drawn as an image, never inline: an SVG in an `<img>` runs no script and fetches nothing.
 * `isInteractive` is drawn the same, static: the sandboxed frame it asks for is not offered.
 */
export function ClaudeModsSvg({
  props
}: {
  props: Record<string, unknown>
}): React.JSX.Element | null {
  const source = propString(props, 'source')
  const image = useRef<HTMLImageElement>(null)
  // Re-reads the ink when the chat's theme changes, as the image cannot inherit it.
  const theme = useNativeChatVisualTheme(image)
  const [ink, setInk] = useState<ClaudeModsSvgInk | null>(null)
  useLayoutEffect(() => {
    if (!image.current) {
      return
    }
    const styles = getComputedStyle(image.current)
    const next = { color: styles.color, fontFamily: styles.fontFamily }
    setInk((previous) =>
      previous?.color === next.color && previous.fontFamily === next.fontFamily ? previous : next
    )
  }, [theme])
  const src = useMemo(
    () => (source && ink ? claudeModsSvgDataUrl(inkClaudeModsSvg(source, ink)) : undefined),
    [source, ink]
  )
  if (!source) {
    return null
  }
  return (
    <img
      ref={image}
      src={src}
      alt={propString(props, 'alt') ?? ''}
      className="block max-w-full"
      style={{ width: claudeModsSvgSide(props.width), height: claudeModsSvgSide(props.height) }}
      draggable={false}
    />
  )
}
