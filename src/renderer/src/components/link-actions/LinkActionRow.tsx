import { ExternalLink, Globe } from 'lucide-react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import type { LinkAction } from './link-action-request'

export function LinkActionRow({
  action,
  shortcut,
  onRun
}: {
  action: LinkAction
  shortcut: 'primary' | 'alternate' | null
  onRun: () => void
}): React.JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')
  const keys =
    shortcut === 'alternate'
      ? [isMac ? '⇧' : 'Shift', isMac ? '⌘' : 'Ctrl', 'Click']
      : shortcut === 'primary'
        ? [isMac ? '⌘' : 'Ctrl', 'Click']
        : null

  return (
    <Button
      className="h-8 w-full justify-start gap-1.5 px-1.5 text-[13px] font-normal has-[>svg]:px-1.5"
      variant="ghost"
      onClick={onRun}
    >
      {action.external === true ? <ExternalLink className="size-3.5" /> : null}
      {action.external === false ? <Globe className="size-3.5" /> : null}
      <span className="min-w-0 flex-1 truncate text-left" title={action.label}>
        {action.label}
      </span>
      {keys ? (
        <ShortcutKeyCombo keys={keys} keyCapClassName="min-w-5 px-1 py-0 text-[11px]" />
      ) : null}
    </Button>
  )
}
