import { cn } from '@/lib/utils'

/**
 * Code as plain text: what an agent quotes and what a file holds is shown as it is, never
 * rendered as Markdown or HTML.
 */
export function AzureDevOpsReviewCodeLines({
  lines,
  startLine,
  label,
  truncated,
  className
}: {
  lines: readonly string[]
  /** Number of the first line; omit for text whose lines are not known, such as a quote. */
  startLine?: number
  label: string
  /** The text was cut; shown as a last line of dots. */
  truncated?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <pre
      aria-label={label}
      className={cn(
        'max-h-48 overflow-auto rounded-sm bg-muted/50 px-2 py-1 font-mono text-xs scrollbar-sleek',
        className
      )}
    >
      {lines.map((line, index) => (
        <div key={index} className="flex gap-3">
          {startLine === undefined ? null : (
            <span className="w-8 shrink-0 text-right text-muted-foreground select-none">
              {startLine + index}
            </span>
          )}
          <span className="whitespace-pre">{line || ' '}</span>
        </div>
      ))}
      {truncated ? <div className="text-muted-foreground select-none">…</div> : null}
    </pre>
  )
}
