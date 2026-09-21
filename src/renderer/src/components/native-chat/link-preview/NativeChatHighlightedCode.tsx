import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'

export type NativeChatHighlightedCodeProps = {
  content: string
  language?: string
  filePath?: string
  startLine?: number
  targetLine?: number | null
  fillHeight?: boolean
}

const HighlightedCode = lazy(() => import('./NativeChatHighlightedCodeImpl'))

export function NativeChatHighlightedCode(
  props: NativeChatHighlightedCodeProps
): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <pre
          className={cn(
            'scrollbar-editor m-0 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs',
            props.fillHeight ? 'h-full min-h-0' : 'max-h-64'
          )}
        >
          <code>{props.content}</code>
        </pre>
      }
    >
      <HighlightedCode {...props} />
    </Suspense>
  )
}
