import { Button } from '@/components/ui/button'

export function NativeChatPreviewMode({
  labels,
  source,
  onChange
}: {
  labels: [string, string]
  source: boolean
  onChange: (source: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 gap-1 border-b border-border/60 p-2" role="group">
      <Button
        type="button"
        size="xs"
        variant={source ? 'ghost' : 'secondary'}
        onClick={() => onChange(false)}
        aria-pressed={!source}
      >
        {labels[0]}
      </Button>
      <Button
        type="button"
        size="xs"
        variant={source ? 'secondary' : 'ghost'}
        onClick={() => onChange(true)}
        aria-pressed={source}
      >
        {labels[1]}
      </Button>
    </div>
  )
}
