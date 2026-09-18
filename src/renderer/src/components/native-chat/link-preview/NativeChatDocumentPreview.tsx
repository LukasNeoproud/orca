import { useState } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { NativeChatPreviewMode } from './NativeChatPreviewMode'

export default function NativeChatDocumentPreview({
  content,
  filePath,
  kind
}: {
  content: string
  filePath: string
  kind: 'markdown' | 'mermaid'
}): React.JSX.Element {
  const [source, setSource] = useState(false)
  const theme = useAppStore((state) => state.settings?.theme)
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const isDiagram = kind === 'mermaid'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <NativeChatPreviewMode
        labels={
          isDiagram
            ? [
                translate('auto.components.nativeChat.preview.diagram', 'Diagram'),
                translate('auto.components.nativeChat.preview.source', 'Source')
              ]
            : [
                translate('auto.components.nativeChat.preview.preview', 'Preview'),
                translate('auto.components.nativeChat.preview.source', 'Source')
              ]
        }
        source={source}
        onChange={setSource}
      />
      <div className="min-h-0 flex-1 overflow-auto scrollbar-editor p-3">
        {source ? (
          <NativeChatHighlightedCode content={content} filePath={filePath} />
        ) : isDiagram ? (
          <MermaidBlock content={content} isDark={isDark} htmlLabels={false} />
        ) : (
          <CommentMarkdown content={content} variant="compact" className="text-sm" />
        )}
      </div>
    </div>
  )
}
