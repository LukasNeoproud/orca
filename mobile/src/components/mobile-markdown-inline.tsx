import { openExternalLink } from '../platform/external-link'
import { createMarkdownInlineMatcher, type MarkdownInlineMatch } from './markdown-inline-matcher'
import {
  Fragment,
  createElement,
  createContext,
  useContext,
  type ComponentType,
  type ReactNode
} from 'react'
import { Text as NativeText, type TextProps } from 'react-native'
import { styles } from './mobile-markdown-styles'
import type { MobileMarkdownLinkTarget } from './mobile-markdown-link-handlers'
import {
  detectFilePathSegments,
  isFilePathCodeSpan,
  normalizeFilePath
} from './markdown-file-path-detection'
import { routeMarkdownHref } from './markdown-href-routing'
import {
  isIntrawordUnderscoreToken,
  trimAutolinkTrailingPunctuation
} from './markdown-inline-token-rules'

function linkActionProps(
  target: MobileMarkdownLinkTarget,
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
) {
  return onShowLinkActions
    ? {
        onLongPress: () => onShowLinkActions(target),
        accessibilityHint: 'Long press for link actions'
      }
    : {}
}

export function hrefActionProps(
  href: string,
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
) {
  const route = routeMarkdownHref(href)
  if (route.kind === 'web') {
    return linkActionProps({ kind: 'web', url: route.url }, onShowLinkActions)
  }
  if (route.kind === 'file') {
    return linkActionProps({ kind: 'file', pathText: route.pathText }, onShowLinkActions)
  }
  return {}
}

export type MarkdownTextSetup = {
  TextComponent: ComponentType<TextProps>
  /** Disable native selection only within the Android transcript. */
  androidTranscript: boolean
  onLongPress?: () => void
}
export const MarkdownTextContext = createContext<MarkdownTextSetup>({
  TextComponent: NativeText,
  androidTranscript: false
})

export function MarkdownText(props: TextProps): React.JSX.Element {
  const { TextComponent, androidTranscript, onLongPress } = useContext(MarkdownTextContext)
  if (!androidTranscript) {
    return createElement(TextComponent, props)
  }
  // Override selection without changing the nested spans' inherited behavior.
  return createElement(TextComponent, {
    ...props,
    ...(props.selectable === true ? { selectable: false } : {}),
    // A link's own long press (its action sheet) wins over the row's.
    ...(onLongPress && props.onPress && !props.onLongPress ? { onLongPress } : {})
  })
}

// Web/mail hrefs open the system handler; file-target hrefs (file: URIs and
// scheme-less paths — the entire desktop file-link contract) go to onOpenFile.
export function openMarkdownHref(
  href: string,
  onOpenFile?: (pathText: string) => void,
  onOpenUrl?: (url: string) => void
): void {
  const route = routeMarkdownHref(href)
  if (route.kind === 'web' && onOpenUrl) {
    onOpenUrl(route.url)
    return
  }
  if (route.kind === 'web') {
    // The seam, not react-native's `Linking`: this module is in the tasks page closure, and inside
    // the shell's WebView `openURL` resolves without opening anything.
    openExternalLink(route.url)
    return
  }
  if (route.kind === 'file' && onOpenFile) {
    onOpenFile(route.pathText)
  }
}

// Render a plain (non-token) text run, splitting out tappable file paths when
// onOpenFile is provided. Without it, paths stay plain text.
function renderTextRun(
  text: string,
  keyPrefix: string,
  onOpenFile?: (pathText: string) => void,
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
): ReactNode {
  if (!onOpenFile) {
    return text
  }
  const segments = detectFilePathSegments(text)
  if (segments.length === 1 && segments[0]!.type === 'text') {
    return text
  }
  return segments.map((segment, segmentIndex) => {
    if (segment.type === 'file') {
      return (
        <MarkdownText
          key={`${keyPrefix}:${segmentIndex}`}
          style={styles.link}
          onPress={() => onOpenFile(segment.path)}
          accessibilityRole="link"
          {...linkActionProps({ kind: 'file', pathText: segment.path }, onShowLinkActions)}
        >
          {segment.value}
        </MarkdownText>
      )
    }
    return <Fragment key={`${keyPrefix}:${segmentIndex}`}>{segment.value}</Fragment>
  })
}

export function renderInline(
  text: string,
  onOpenFile?: (pathText: string) => void,
  onOpenUrl?: (url: string) => void,
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = createMarkdownInlineMatcher(
    text,
    /(`[^`]+`|~~[^~]+~~|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<]+)/g,
    true
  )
  let pendingStart = 0
  let match: MarkdownInlineMatch | null

  while ((match = pattern.exec())) {
    const token = match[0]
    // Intraword `_` runs (snake_case, dunder tails) are literal text per
    // CommonMark; leaving them unflushed keeps surrounding file paths whole
    // for detection in the eventual text run.
    if (token.startsWith('_') && isIntrawordUnderscoreToken(text, match.index, token)) {
      // Resume after the opener so real tokens inside the rejected span are still scanned.
      pattern.lastIndex = match.index + 1
      continue
    }
    if (match.index > pendingStart) {
      parts.push(
        renderTextRun(
          text.slice(pendingStart, match.index),
          `t${pendingStart}`,
          onOpenFile,
          onShowLinkActions
        )
      )
    }
    pendingStart = pattern.lastIndex
    const key = `${match.index}:${token}`
    const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (image) {
      parts.push(
        <MarkdownText
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(image[2]!, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...hrefActionProps(image[2]!, onShowLinkActions)}
        >
          {image[1] || 'image'}
        </MarkdownText>
      )
    } else if (link) {
      parts.push(
        <MarkdownText
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(link[2]!, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...hrefActionProps(link[2]!, onShowLinkActions)}
        >
          {link[1]}
        </MarkdownText>
      )
    } else if (/^https?:\/\//i.test(token)) {
      const { url, trailing } = trimAutolinkTrailingPunctuation(token)
      parts.push(
        <MarkdownText
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(url, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...linkActionProps({ kind: 'web', url }, onShowLinkActions)}
        >
          {url}
        </MarkdownText>
      )
      if (trailing) {
        parts.push(<Fragment key={`${key}p`}>{trailing}</Fragment>)
      }
    } else if (token.startsWith('`')) {
      const code = token.slice(1, -1)
      if (onOpenFile && isFilePathCodeSpan(code)) {
        parts.push(
          <MarkdownText
            key={key}
            style={[styles.inlineCode, styles.inlineCodeLink]}
            onPress={() => onOpenFile(normalizeFilePath(code.trim()))}
            accessibilityRole="link"
            {...linkActionProps(
              { kind: 'file', pathText: normalizeFilePath(code.trim()) },
              onShowLinkActions
            )}
          >
            {code}
          </MarkdownText>
        )
      } else {
        parts.push(
          <MarkdownText key={key} style={styles.inlineCode}>
            {code}
          </MarkdownText>
        )
      }
    } else if (token.startsWith('~~')) {
      parts.push(
        <MarkdownText key={key} style={styles.strike}>
          {renderTextRun(token.slice(2, -2), `${key}i`, onOpenFile, onShowLinkActions)}
        </MarkdownText>
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(
        <MarkdownText key={key} style={styles.bold}>
          {renderTextRun(token.slice(2, -2), `${key}i`, onOpenFile, onShowLinkActions)}
        </MarkdownText>
      )
    } else {
      parts.push(
        <MarkdownText key={key} style={styles.italic}>
          {renderTextRun(token.slice(1, -1), `${key}i`, onOpenFile, onShowLinkActions)}
        </MarkdownText>
      )
    }
  }

  if (pendingStart < text.length) {
    parts.push(
      renderTextRun(text.slice(pendingStart), `t${pendingStart}`, onOpenFile, onShowLinkActions)
    )
  }
  return parts
}
