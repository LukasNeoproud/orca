import { cn } from '@/lib/utils'
import type { ChatApproval } from './native-chat-interactive-prompt'

/** An approval's options as buttons; the first is the primary one. */
export function NativeChatApprovalOptionButtons({
  options,
  disabled,
  onChoose
}: {
  options: ChatApproval['options']
  disabled: boolean
  onChoose: (send: string) => void
}): React.JSX.Element {
  return (
    <div data-native-chat-approval-actions="true" className="flex shrink-0 flex-wrap gap-2">
      {options.map((opt, i) => (
        <button
          key={`${opt.label}-${i}`}
          type="button"
          disabled={disabled}
          title={opt.description}
          onClick={() => onChoose(opt.send)}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            i === 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'border border-border bg-background text-foreground hover:bg-accent'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
