import { Fragment, createContext, memo, useContext, useMemo, type ReactNode } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { normalizeMobileMarkdownPreviewHtml } from './mobile-markdown-preview-html'
import { styles } from './mobile-markdown-styles'
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
import { isMobileMermaidLanguage } from './mobile-mermaid-language'
import { parseMobileMarkdown } from './mobile-markdown-parser'
import { MermaidDiagram } from './pr-sidebar/MermaidDiagram'

type Props = {
  content?: string
  fallback?: string
  /** Multiplier for prose font size (paragraphs, lists, quotes). Defaults to 1;
   *  the chat view passes >1 so agent prose reads larger than the compact base. */
  textScale?: number
  selectable?: boolean
  /** When provided, detected file paths and file-target hrefs render as tappable
   *  and invoke this with the path text (worktree-relative or absolute, with an
   *  optional :line(:col) suffix). Omitted on screens with no file viewer, where
   *  paths render as plain text (no behavior change). */
  onOpenFile?: (pathText: string) => void
  onOpenUrl?: (url: string) => void
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
}

export type MobileMarkdownLinkTarget =
  | { kind: 'file'; pathText: string }
  | { kind: 'web'; url: string }

type MobileMarkdownLinkHandlers = Pick<Props, 'onOpenUrl' | 'onShowLinkActions'>

const MobileMarkdownLinkContext = createContext<MobileMarkdownLinkHandlers>({})

export const MobileMarkdownLinkHandlerProvider = MobileMarkdownLinkContext.Provider

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

function hrefActionProps(
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

const MAX_TABLE_ROWS = 40
const MAX_TABLE_COLUMNS = 8
/** Prose base size — passed to MermaidDiagram fallback mono text. */
const MERMAID_BASE = 13

// Web/mail hrefs use the owning surface's router when provided; file-target
// hrefs (file: URIs and scheme-less paths) go to onOpenFile.
function openMarkdownHref(
  href: string,
  onOpenFile?: (pathText: string) => void,
  onOpenUrl?: (url: string) => void
): void {
  const route = routeMarkdownHref(href)
  if (route.kind === 'web') {
    if (onOpenUrl) {
      onOpenUrl(route.url)
    } else {
      void Linking.openURL(route.url).catch(() => {})
    }
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
        <Text
          key={`${keyPrefix}:${segmentIndex}`}
          style={styles.link}
          onPress={() => onOpenFile(segment.path)}
          accessibilityRole="link"
          {...linkActionProps({ kind: 'file', pathText: segment.path }, onShowLinkActions)}
        >
          {segment.value}
        </Text>
      )
    }
    return <Fragment key={`${keyPrefix}:${segmentIndex}`}>{segment.value}</Fragment>
  })
}

function renderInline(
  text: string,
  onOpenFile?: (pathText: string) => void,
  onOpenUrl?: (url: string) => void,
  onShowLinkActions?: (target: MobileMarkdownLinkTarget) => void
): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern =
    /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|~~[^~]+~~|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g
  let pendingStart = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
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
        <Text
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(image[2]!, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...hrefActionProps(image[2]!, onShowLinkActions)}
        >
          {image[1] || 'image'}
        </Text>
      )
    } else if (link) {
      parts.push(
        <Text
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(link[2]!, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...hrefActionProps(link[2]!, onShowLinkActions)}
        >
          {link[1]}
        </Text>
      )
    } else if (/^https?:\/\//i.test(token)) {
      const { url, trailing } = trimAutolinkTrailingPunctuation(token)
      parts.push(
        <Text
          key={key}
          style={styles.link}
          onPress={() => openMarkdownHref(url, onOpenFile, onOpenUrl)}
          accessibilityRole="link"
          {...linkActionProps({ kind: 'web', url }, onShowLinkActions)}
        >
          {url}
        </Text>
      )
      if (trailing) {
        parts.push(<Fragment key={`${key}p`}>{trailing}</Fragment>)
      }
    } else if (token.startsWith('`')) {
      const code = token.slice(1, -1)
      if (onOpenFile && isFilePathCodeSpan(code)) {
        parts.push(
          <Text
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
          </Text>
        )
      } else {
        parts.push(
          <Text key={key} style={styles.inlineCode}>
            {code}
          </Text>
        )
      }
    } else if (token.startsWith('~~')) {
      parts.push(
        <Text key={key} style={styles.strike}>
          {renderTextRun(token.slice(2, -2), `${key}i`, onOpenFile, onShowLinkActions)}
        </Text>
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(
        <Text key={key} style={styles.bold}>
          {renderTextRun(token.slice(2, -2), `${key}i`, onOpenFile, onShowLinkActions)}
        </Text>
      )
    } else {
      parts.push(
        <Text key={key} style={styles.italic}>
          {renderTextRun(token.slice(1, -1), `${key}i`, onOpenFile, onShowLinkActions)}
        </Text>
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

function MobileMarkdownInner({
  content,
  fallback = '',
  textScale = 1,
  selectable = true,
  onOpenFile,
  onOpenUrl,
  onShowLinkActions
}: Props) {
  const contextualLinkHandlers = useContext(MobileMarkdownLinkContext)
  const resolvedOpenUrl = onOpenUrl ?? contextualLinkHandlers.onOpenUrl
  const resolvedShowLinkActions = onShowLinkActions ?? contextualLinkHandlers.onShowLinkActions
  const text = content?.trim() ?? ''
  const previewText = useMemo(() => normalizeMobileMarkdownPreviewHtml(text), [text])
  const blocks = useMemo(() => parseMobileMarkdown(previewText), [previewText])
  // Scale prose sizes; inline spans inherit fontSize from the wrapping Text.
  const scaled = (size: number): { fontSize: number; lineHeight: number } | null =>
    textScale !== 1 ? { fontSize: size * textScale, lineHeight: (size + 6) * textScale } : null
  const proseScale = scaled(13)
  const listScale = scaled(14)
  if (!text) {
    return fallback ? <Text style={styles.paragraph}>{fallback}</Text> : null
  }
  const mermaidSourceOccurrences = new Map<string, number>()

  return (
    <View style={styles.root}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={index}
              selectable={selectable}
              style={[styles.heading, block.level <= 2 ? styles.headingLarge : null]}
            >
              {renderInline(block.text, onOpenFile, resolvedOpenUrl, resolvedShowLinkActions)}
            </Text>
          )
        }
        if (block.type === 'quote') {
          return (
            <View key={index} style={styles.quote}>
              <Text selectable={selectable} style={styles.quoteText}>
                {renderInline(block.text, onOpenFile, resolvedOpenUrl, resolvedShowLinkActions)}
              </Text>
            </View>
          )
        }
        if (block.type === 'code') {
          // Mermaid fences render as diagrams (WebView), not as raw code — same as PR sidebar.
          // Unclosed fences are still streaming: mounting the WebView per tick would
          // reload its document up to 20x/sec, so they stay raw code until terminated.
          if (isMobileMermaidLanguage(block.language) && block.closed) {
            const occurrence = mermaidSourceOccurrences.get(block.text) ?? 0
            mermaidSourceOccurrences.set(block.text, occurrence + 1)
            return (
              <MermaidDiagram
                key={`${block.text}:${occurrence}`}
                source={block.text}
                base={MERMAID_BASE}
              />
            )
          }
          return (
            <View key={index} style={styles.codeBlock}>
              {block.language ? <Text style={styles.codeLanguage}>{block.language}</Text> : null}
              <Text selectable={selectable} style={styles.codeText}>
                {block.text}
              </Text>
            </View>
          )
        }
        if (block.type === 'image') {
          return (
            <Pressable
              key={index}
              style={styles.imageFrame}
              onPress={() => openMarkdownHref(block.url, onOpenFile, resolvedOpenUrl)}
              delayLongPress={450}
              accessibilityRole="link"
              {...hrefActionProps(block.url, resolvedShowLinkActions)}
            >
              <Text style={styles.link}>{block.alt || 'Open image'}</Text>
              <Text style={styles.imageCaption} numberOfLines={1}>
                {block.url}
              </Text>
            </Pressable>
          )
        }
        if (block.type === 'table') {
          const visibleHeaders = block.headers.slice(0, MAX_TABLE_COLUMNS)
          const visibleRows = block.rows.slice(0, MAX_TABLE_ROWS)
          const hiddenRows = Math.max(0, block.rows.length - visibleRows.length)
          const hiddenColumns = Math.max(0, block.headers.length - visibleHeaders.length)
          return (
            <ScrollView key={index} horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={styles.tableRow}>
                  {visibleHeaders.map((header, cellIndex) => (
                    <Text
                      key={cellIndex}
                      selectable={selectable}
                      style={[styles.tableCell, styles.tableHeader]}
                    >
                      {renderInline(header, onOpenFile, resolvedOpenUrl, resolvedShowLinkActions)}
                    </Text>
                  ))}
                </View>
                {visibleRows.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.tableRow}>
                    {visibleHeaders.map((_, cellIndex) => (
                      <Text key={cellIndex} selectable={selectable} style={styles.tableCell}>
                        {renderInline(
                          row[cellIndex] ?? '',
                          onOpenFile,
                          resolvedOpenUrl,
                          resolvedShowLinkActions
                        )}
                      </Text>
                    ))}
                  </View>
                ))}
                {hiddenRows > 0 || hiddenColumns > 0 ? (
                  <Text style={styles.tableTruncated}>
                    {hiddenRows > 0 ? `${hiddenRows} more rows` : ''}
                    {hiddenRows > 0 && hiddenColumns > 0 ? ' · ' : ''}
                    {hiddenColumns > 0 ? `${hiddenColumns} more columns` : ''}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
          )
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listItem}>
                  <Text style={styles.listMarker}>
                    {item.checked == null
                      ? block.ordered
                        ? `${itemIndex + 1}.`
                        : '-'
                      : item.checked
                        ? '[x]'
                        : '[ ]'}
                  </Text>
                  <Text selectable={selectable} style={[styles.listText, listScale]}>
                    {renderInline(item.text, onOpenFile, resolvedOpenUrl, resolvedShowLinkActions)}
                  </Text>
                </View>
              ))}
            </View>
          )
        }
        if (block.type === 'rule') {
          return <View key={index} style={styles.rule} />
        }
        return (
          <Text key={index} selectable={selectable} style={[styles.paragraph, proseScale]}>
            {block.text.split('\n').map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? '\n' : null}
                {renderInline(line, onOpenFile, resolvedOpenUrl, resolvedShowLinkActions)}
              </Fragment>
            ))}
          </Text>
        )
      })}
    </View>
  )
}

export const MobileMarkdown = memo(MobileMarkdownInner)
