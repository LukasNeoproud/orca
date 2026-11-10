import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import {
  formatSubagentTokens,
  subagentStateLabel
} from '../../../../shared/native-chat-subagent-group-header'
import { normalizeSubagentState } from '../../../../shared/native-chat-subagent-summary'
import type { NativeChatSubagentRow } from '../../../../shared/native-chat-transcript-projection'
import type { NativeChatSubagentEntry } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import { StatusDot } from './NativeChatSubagentRun'
import { nativeChatSidePanelSubagents } from './native-chat-side-panel-findings'
import type { NativeChatSidePanelFeed } from './native-chat-side-panel-context'
import { sayNativeChatSubagentGroupTranslated as say } from './native-chat-subagent-group-words-text'

const NO_ROWS: readonly NativeChatSubagentRow[] = []
const noop = (): void => {}
/** Within this of the end, new rows keep the view at the end. */
const FOLLOW_SLACK_PX = 48

function SubagentLine({ entry }: { entry: NativeChatSubagentEntry }): React.JSX.Element {
  const state = normalizeSubagentState(entry.state)
  return (
    <>
      <StatusDot state={state} pulsing={state === 'working'} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {subagentStateLabel(state, 1, 1, say)}
        {typeof entry.tokens === 'number' ? ` · ${formatSubagentTokens(entry.tokens)}` : null}
      </span>
    </>
  )
}

/** One subagent's own rows, kept at the end while it works unless the reader scrolled up. */
function SubagentTranscript({
  rows,
  onLinkClick,
  runtimeContext
}: {
  rows: readonly NativeChatSubagentRow[]
  onLinkClick: NativeChatSidePanelFeed['onLinkClick']
  runtimeContext: RuntimeFileOperationArgs | null | undefined
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const follows = useRef(true)
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && follows.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [rows])
  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const element = event.currentTarget
        follows.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX
      }}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3 scrollbar-sleek"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'components.native-chat.subagents.panelEmpty',
            'Nothing from this subagent is loaded yet.'
          )}
        </p>
      ) : (
        rows.map((row) => (
          <MessageRow
            key={row.message.id}
            message={row.message}
            expandSignal={false}
            onScrollMessageToTop={noop}
            onLinkClick={onLinkClick}
            allowFileUriLinks={onLinkClick !== undefined}
            runtimeContext={runtimeContext}
          />
        ))
      )}
    </div>
  )
}

/** The Subagents tab: every subagent of the conversation, and one's own rows once picked. */
export function NativeChatSidePanelSubagents({
  feed,
  runtimeContext,
  opened,
  onOpen
}: {
  feed: NativeChatSidePanelFeed
  /** Where the chat's images are read, as its transcript reads them. */
  runtimeContext: RuntimeFileOperationArgs | null | undefined
  /** The entry as its row showed it when picked; the conversation's newest word wins. */
  opened: NativeChatSubagentEntry | null
  onOpen: (entry: NativeChatSubagentEntry | null) => void
}): React.JSX.Element {
  const agents = useMemo(
    () => nativeChatSidePanelSubagents(feed.conversation ?? []),
    [feed.conversation]
  )
  // A subagent is a task of the session: the strip's Stop ends it by the id its row carries.
  const stop = feed.background?.stopBackgroundTask
  const [stopping, setStopping] = useState<string | null>(null)
  if (opened) {
    const current = agents.find((agent) => agent.id === opened.id) ?? opened
    return (
      <div
        data-native-chat-side-panel-subagent={opened.id}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpen(null)}
            aria-label={translate('components.native-chat.sidePanel.allSubagents', 'All subagents')}
          >
            <ArrowLeft />
          </Button>
          <SubagentLine entry={current} />
          {stop && normalizeSubagentState(current.state) === 'working' ? (
            <Button
              variant="outline"
              size="xs"
              disabled={stopping === current.id}
              onClick={() => {
                setStopping(current.id)
                void stop(current.id).finally(() => setStopping(null))
              }}
            >
              {translate('components.native-chat.sidePanel.stopSubagent', 'Stop')}
            </Button>
          ) : null}
        </div>
        <SubagentTranscript
          rows={feed.subagentRows?.get(opened.id) ?? NO_ROWS}
          onLinkClick={feed.onLinkClick}
          runtimeContext={runtimeContext}
        />
      </div>
    )
  }
  if (agents.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {translate(
          'components.native-chat.sidePanel.noSubagents',
          'This conversation has started no subagents.'
        )}
      </p>
    )
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-sleek">
      {agents.map((agent) => (
        <li key={agent.id}>
          <button
            type="button"
            onClick={() => onOpen(agent)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SubagentLine entry={agent} />
          </button>
        </li>
      ))}
    </ul>
  )
}
