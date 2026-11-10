import { useContext, useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { NativeChatClaudeControlsContext } from './native-chat-claude-controls-context'
import { formatNativeChatDuration } from './NativeChatWorkingStatus'

/** A command this quick needs no way out; past it, the wait is worth naming. */
const SHOWN_AFTER_SECONDS = 4

/**
 * Under a shell command still running in a Claude chat: how long this view has watched it run,
 * and a way to send it to the background so the turn goes on (the terminal's Ctrl+B).
 */
export function NativeChatRunningToolBackground({
  callId
}: {
  callId: string
}): React.JSX.Element | null {
  const controls = useContext(NativeChatClaudeControlsContext)
  const [seconds, setSeconds] = useState(0)
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [callId])
  if (!controls || seconds < SHOWN_AFTER_SECONDS) {
    return null
  }
  return (
    <div
      data-native-chat-running-tool={callId}
      className="ml-6 flex items-center gap-2 py-0.5 text-xs text-chat-foreground-faint"
    >
      <span className="tabular-nums">
        {translate('components.native-chat.tool.runningFor', 'Running for {{value0}}', {
          value0: formatNativeChatDuration(seconds)
        })}
      </span>
      <button
        type="button"
        disabled={asked}
        onClick={() => {
          setAsked(true)
          void controls.backgroundTool(callId).then((moved) => !moved && setAsked(false))
        }}
        className="rounded-sm underline-offset-2 hover:text-chat-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        {translate('components.native-chat.tool.moveToBackground', 'Move to background')}
      </button>
    </div>
  )
}
