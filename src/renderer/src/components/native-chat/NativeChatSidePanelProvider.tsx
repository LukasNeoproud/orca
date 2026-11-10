import { useCallback, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useStructuredAgentSessionHostCapability } from '@/runtime/structured-agent-session-host-capability'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { NativeChatSubagentEntry } from '../../../../shared/native-chat-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY } from '../../../../shared/structured-agent-session-surface-capabilities'
import { NATIVE_CHAT_APPEARANCE_ROOT_CLASS } from './native-chat-appearance-style'
import { useNativeChatImageRuntimeContext } from './native-chat-image-runtime-context'
import { NativeChatSidePanelArtifacts } from './NativeChatSidePanelArtifacts'
import { NativeChatSidePanelContextTab } from './NativeChatSidePanelContextTab'
import { NativeChatSidePanelPlan } from './NativeChatSidePanelPlan'
import { NativeChatSidePanelSubagents } from './NativeChatSidePanelSubagents'
import { NativeChatStructuredSessionStatus } from './NativeChatStructuredSessionStatus'
import {
  NATIVE_CHAT_SIDE_PANEL_TABS,
  NativeChatSidePanelContext,
  type NativeChatSidePanel,
  type NativeChatSidePanelFeed,
  type NativeChatSidePanelTab
} from './native-chat-side-panel-context'

function tabLabel(tab: NativeChatSidePanelTab): string {
  switch (tab) {
    case 'background':
      return translate('components.native-chat.sidePanel.background', 'Background')
    case 'plan':
      return translate('components.native-chat.sidePanel.planAndTasks', 'Plan')
    case 'subagents':
      return translate('components.native-chat.sidePanel.subagents', 'Subagents')
    case 'context':
      return translate('components.native-chat.sidePanel.context', 'Context')
    case 'artifacts':
      return translate('components.native-chat.sidePanel.artifacts', 'Artifacts')
  }
}

/** Mounts the panel beside a structured chat: its background work, plan, subagents, context and
 *  artifacts. The chat's own pieces publish what each tab shows. */
export function NativeChatSidePanelProvider({
  session,
  children
}: {
  session: { tabId: string; sessionId: string; agent: AgentType; target: RuntimeClientTarget }
  children: React.ReactNode
}): React.JSX.Element {
  const [tab, setTab] = useState<NativeChatSidePanelTab | null>(null)
  const [subagent, setSubagent] = useState<NativeChatSubagentEntry | null>(null)
  // Published on every streamed frame: kept out of state while the panel is closed.
  const feedRef = useRef<NativeChatSidePanelFeed>({})
  const [, setFeedVersion] = useState(0)
  const open = tab !== null
  const openRef = useRef(open)
  openRef.current = open
  const publish = useCallback((part: NativeChatSidePanelFeed) => {
    feedRef.current = { ...feedRef.current, ...part }
    if (openRef.current) {
      setFeedVersion((version) => version + 1)
    }
  }, [])
  const asksClaude =
    useStructuredAgentSessionHostCapability(
      session.target,
      AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY
    ) && session.agent === 'claude'
  const openAgentId = tab === 'subagents' ? (subagent?.id ?? null) : null
  const panel = useMemo<NativeChatSidePanel>(
    () => ({
      tab,
      openAgentId,
      toggle: (next) => setTab((current) => next ?? (current === null ? 'background' : null)),
      openSubagent: (entry) => {
        if (openRef.current && openAgentId === entry.id) {
          setTab(null)
          return
        }
        setSubagent(entry)
        setTab('subagents')
      },
      publish
    }),
    [openAgentId, publish, tab]
  )
  const feed = feedRef.current
  const imageRuntimeContext = useNativeChatImageRuntimeContext(session.tabId)
  return (
    <NativeChatSidePanelContext.Provider value={panel}>
      {/* Always present, so opening the panel narrows the chat without remounting it. */}
      <div className="flex h-full min-w-0 flex-1">{children}</div>
      {tab ? (
        <aside
          data-native-chat-side-panel={tab}
          aria-label={translate('components.native-chat.sidePanel.label', 'Conversation panel')}
          className={cn(
            NATIVE_CHAT_APPEARANCE_ROOT_CLASS,
            'flex h-full w-[28rem] max-w-[50%] shrink-0 flex-col border-l border-border bg-chat-canvas'
          )}
        >
          <header className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setTab(NATIVE_CHAT_SIDE_PANEL_TABS.find((known) => known === value) ?? tab)
              }
              className="min-w-0 flex-1"
            >
              <TabsList>
                {NATIVE_CHAT_SIDE_PANEL_TABS.map((known) => (
                  <TabsTrigger key={known} value={known}>
                    {tabLabel(known)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTab(null)}
              aria-label={translate('components.native-chat.sidePanel.close', 'Close panel')}
            >
              <X />
            </Button>
          </header>
          {tab === 'background' ? (
            feed.background ? (
              // Its own publisher is cut off here: this copy only reads.
              <NativeChatSidePanelContext.Provider value={undefined}>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-sleek">
                  <NativeChatStructuredSessionStatus {...feed.background} startsExpanded />
                </div>
              </NativeChatSidePanelContext.Provider>
            ) : null
          ) : tab === 'plan' ? (
            <NativeChatSidePanelPlan feed={feed} />
          ) : tab === 'subagents' ? (
            <NativeChatSidePanelSubagents
              feed={feed}
              runtimeContext={imageRuntimeContext}
              opened={subagent}
              onOpen={setSubagent}
            />
          ) : tab === 'context' ? (
            <NativeChatSidePanelContextTab
              feed={feed}
              target={session.target}
              sessionId={session.sessionId}
              asksClaude={asksClaude}
            />
          ) : (
            <NativeChatSidePanelArtifacts feed={feed} />
          )}
        </aside>
      ) : null}
    </NativeChatSidePanelContext.Provider>
  )
}
