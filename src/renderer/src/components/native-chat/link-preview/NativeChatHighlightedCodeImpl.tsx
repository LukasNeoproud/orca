import { useEffect, useMemo, useRef } from 'react'
import { all, createLowlight } from 'lowlight'
import type { Element, Root, RootContent, Text } from 'hast'
import type { NativeChatHighlightedCodeProps } from './NativeChatHighlightedCode'
import { previewCodeLanguage } from './native-chat-preview-kind'
import { cn } from '@/lib/utils'

const lowlight = createLowlight(all)

function renderNode(node: RootContent, key: number): React.ReactNode {
  if (node.type === 'text') {
    return (node as Text).value
  }
  if (node.type !== 'element') {
    return null
  }
  const element = node as Element
  const classes = element.properties.className
  return (
    <span key={key} className={Array.isArray(classes) ? classes.join(' ') : undefined}>
      {element.children.map(renderNode)}
    </span>
  )
}

export default function NativeChatHighlightedCodeImpl({
  content,
  language,
  filePath,
  startLine,
  targetLine,
  fillHeight = false
}: NativeChatHighlightedCodeProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const syntax = useMemo<Root | null>(() => {
    const selected = (
      language ||
      (filePath ? previewCodeLanguage(filePath) : '') ||
      ''
    ).toLowerCase()
    if (!selected || !lowlight.registered(selected)) {
      return null
    }
    try {
      return lowlight.highlight(selected, content)
    } catch {
      return null
    }
  }, [content, filePath, language])
  const lines = content.split('\n')
  useEffect(() => {
    if (!startLine || !targetLine || targetLine < startLine) {
      return
    }
    const row = rootRef.current?.querySelector(`[data-preview-line="${targetLine}"]`)
    const surface = rootRef.current
    if (row instanceof HTMLElement && surface) {
      surface.scrollTop = row.offsetTop - surface.offsetTop - surface.clientHeight / 2
    }
  }, [startLine, targetLine, content])
  return (
    <div
      ref={rootRef}
      className={cn(
        'rich-markdown-code-block-wrapper my-0 min-w-0 overflow-auto scrollbar-editor',
        fillHeight ? 'my-0! h-full min-h-0' : 'max-h-64'
      )}
    >
      {startLine && startLine > 0 ? (
        <div className="flex font-mono text-xs leading-5">
          <div
            aria-hidden="true"
            className="select-none border-r border-border/60 px-2 text-right text-muted-foreground tabular-nums"
          >
            {lines.map((_, i) => (
              <div
                key={i}
                data-preview-line={startLine + i}
                className={targetLine === startLine + i ? 'bg-accent text-foreground' : undefined}
              >
                {startLine + i}
              </div>
            ))}
          </div>
          <pre className="m-0 min-w-max p-2">
            <code>{syntax ? syntax.children.map(renderNode) : content}</code>
          </pre>
        </div>
      ) : (
        <pre className="m-0 min-w-max p-3 font-mono text-xs leading-5">
          <code>{syntax ? syntax.children.map(renderNode) : content}</code>
        </pre>
      )}
    </div>
  )
}
