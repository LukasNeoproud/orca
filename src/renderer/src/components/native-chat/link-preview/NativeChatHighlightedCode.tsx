import { lazy, Suspense } from 'react'

export type NativeChatHighlightedCodeProps = {
  content: string
  language?: string
  filePath?: string
  startLine?: number
  targetLine?: number | null
}

const HighlightedCode = lazy(() => import('./NativeChatHighlightedCodeImpl'))

export function NativeChatHighlightedCode(
  props: NativeChatHighlightedCodeProps
): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <pre className="scrollbar-editor overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
          <code>{props.content}</code>
        </pre>
      }
    >
      <HighlightedCode {...props} />
    </Suspense>
  )
}
