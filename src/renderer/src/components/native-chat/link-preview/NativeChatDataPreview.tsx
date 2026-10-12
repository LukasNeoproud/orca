import { useMemo, useState } from 'react'
import { parseDocument } from 'yaml'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import CsvViewer from '@/components/editor/csv/CsvViewer'
import { translate } from '@/i18n/i18n'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { NativeChatPreviewMode } from './NativeChatPreviewMode'

function valueText(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (value === null) {
    return 'null'
  }
  return typeof value === 'object' ? '' : String(value)
}

function TreeNode({
  name,
  value,
  depth = 0
}: {
  name: string
  value: unknown
  depth?: number
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(depth < 2)
  if (depth > 24 || typeof value !== 'object' || value === null) {
    return (
      <div className="flex gap-2 px-2 py-0.5 font-mono text-xs">
        <span className="text-muted-foreground">{name}</span>
        <span className="break-all">{depth > 24 ? '…' : valueText(value)}</span>
      </div>
    )
  }
  const entries = Object.entries(value)
  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="ml-3 border-l border-border/60 pl-2"
    >
      <summary className="cursor-pointer py-0.5 font-mono text-xs text-foreground">
        {name}{' '}
        <span className="text-muted-foreground">
          {Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </summary>
      {expanded &&
        entries.map(([key, child]) => (
          <TreeNode key={key} name={key} value={child} depth={depth + 1} />
        ))}
    </details>
  )
}

export default function NativeChatDataPreview({
  content,
  filePath,
  kind
}: {
  content: string
  filePath: string
  kind: 'json' | 'yaml' | 'csv'
}): React.JSX.Element {
  const [source, setSource] = useState(false)
  const parsed = useMemo(() => {
    if (kind === 'csv') {
      return { value: null, error: null }
    }
    try {
      if (kind === 'json') {
        if (filePath.toLowerCase().endsWith('.jsonc')) {
          const errors: ParseError[] = []
          const value = parseJsonc(content, errors, { allowTrailingComma: true }) as unknown
          if (errors.length) {
            throw new Error('Invalid JSON with comments')
          }
          return { value, error: null }
        }
        return { value: JSON.parse(content) as unknown, error: null }
      }
      const document = parseDocument(content)
      if (document.errors.length) {
        throw document.errors[0]
      }
      return { value: document.toJS({ maxAliasCount: 100 }) as unknown, error: null }
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : String(error) }
    }
  }, [content, filePath, kind])
  const formattedLabel =
    kind === 'csv'
      ? translate('auto.components.nativeChat.preview.table', 'Table')
      : translate('auto.components.nativeChat.preview.tree', 'Tree')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <NativeChatPreviewMode
        labels={[formattedLabel, translate('auto.components.nativeChat.preview.text', 'Text')]}
        source={source}
        onChange={setSource}
      />
      <div className="min-h-0 flex-1 overflow-auto scrollbar-editor">
        {source || parsed.error ? (
          <div className="p-3">
            {parsed.error ? (
              <p role="status" className="mb-2 text-xs text-muted-foreground">
                {translate(
                  'auto.components.nativeChat.preview.invalidStructuredData',
                  'Unable to parse structured data'
                )}
              </p>
            ) : null}
            <NativeChatHighlightedCode content={content} filePath={filePath} />
          </div>
        ) : kind === 'csv' ? (
          <CsvViewer content={content} filePath={filePath} />
        ) : (
          <div className="p-3">
            <TreeNode name={filePath.split(/[/\\]/).pop() || filePath} value={parsed.value} />
          </div>
        )}
      </div>
    </div>
  )
}
