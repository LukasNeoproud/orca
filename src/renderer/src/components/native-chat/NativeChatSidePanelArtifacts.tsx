import { useMemo } from 'react'
import { ChartNoAxesCombined, ExternalLink } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { nativeChatSidePanelArtifacts } from './native-chat-side-panel-findings'
import type { NativeChatSidePanelFeed } from './native-chat-side-panel-context'
import { useNativeChatVisualOwner } from './native-chat-visual-owner'

const ROW_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The Artifacts tab: what the conversation produced to look at, as links. A visual opens in its
 *  own tab, a claude.ai artifact in the browser. */
export function NativeChatSidePanelArtifacts({
  feed
}: {
  feed: NativeChatSidePanelFeed
}): React.JSX.Element {
  const owner = useNativeChatVisualOwner()
  const openChatVisualTab = useAppStore((state) => state.openChatVisualTab)
  const artifacts = useMemo(
    () => nativeChatSidePanelArtifacts(feed.conversation ?? []),
    [feed.conversation]
  )
  if (artifacts.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">
        {translate(
          'components.native-chat.sidePanel.noArtifacts',
          'This conversation has produced no artifacts yet.'
        )}
      </p>
    )
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2 scrollbar-sleek">
      {artifacts.map((artifact) =>
        artifact.kind === 'visual' ? (
          <li key={`visual:${artifact.file}`}>
            <button
              type="button"
              disabled={!owner}
              className={ROW_CLASS}
              onClick={() =>
                owner &&
                openChatVisualTab(owner.worktreeId, {
                  target: owner.target,
                  sessionId: owner.sessionId,
                  file: artifact.file,
                  title: artifact.title
                })
              }
            >
              <ChartNoAxesCombined aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{artifact.title ?? artifact.file}</span>
            </button>
          </li>
        ) : (
          <li key={`link:${artifact.url}`}>
            <button
              type="button"
              className={ROW_CLASS}
              onClick={() => void window.api.shell.openUrl(artifact.url)}
            >
              <ExternalLink aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{artifact.url.replace('https://', '')}</span>
            </button>
          </li>
        )
      )}
    </ul>
  )
}
