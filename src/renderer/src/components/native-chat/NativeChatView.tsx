import { NativeChatSessionGate } from './NativeChatSessionGate'
import { NativeChatStructuredSession } from './NativeChatStructuredSession'
import { NativeChatResolvedView } from './NativeChatResolvedView'
import { useNativeChatStatusEntry } from './use-native-chat-status-entry'
import type { NativeChatViewProps } from './native-chat-view-types'
import { NativeChatStructuredAdoption } from './NativeChatStructuredAdoption'

export type { NativeChatViewProps } from './native-chat-view-types'

/** Resolves an agent terminal into its native conversation and composer UI. */
export default function NativeChatView(props: NativeChatViewProps): React.JSX.Element {
  if (props.mode === 'structured') {
    return <NativeChatStructuredSession key={props.sessionId} {...props} />
  }
  return <NativeChatBridgeView {...props} />
}

function NativeChatBridgeView({
  terminalTabId,
  isVisible,
  paneKey: preferredPaneKey,
  targetPtyId = null,
  launchAgent,
  resolvedAgent,
  ownsTabWideLaunchDraft,
  onSwitchToTerminal,
  readTerminalScreen,
  contextMenuActions,
  terminalContext
}: Exclude<NativeChatViewProps, { mode: 'structured' }>): React.JSX.Element {
  const {
    entry: agentStatusEntry,
    paneKey,
    detectedAgent
  } = useNativeChatStatusEntry(terminalTabId, preferredPaneKey)
  return (
    <NativeChatSessionGate
      paneKey={paneKey}
      launchAgent={launchAgent}
      resolvedAgent={resolvedAgent}
      agentStatusEntry={agentStatusEntry}
      detectedAgent={detectedAgent}
      ptyId={targetPtyId}
    >
      {(resolution) => {
        const resolvedProps = {
          paneKey: resolution.paneKey,
          agent: resolution.agent,
          sessionId: resolution.sessionId,
          transcriptPath: resolution.transcriptPath,
          isVisible,
          targetPtyId,
          terminalTabId,
          ownsTabWideLaunchDraft,
          onSwitchToTerminal,
          readTerminalScreen,
          contextMenuActions
        }
        return terminalContext ? (
          <NativeChatStructuredAdoption {...resolvedProps} terminalContext={terminalContext} />
        ) : (
          <NativeChatResolvedView {...resolvedProps} />
        )
      }}
    </NativeChatSessionGate>
  )
}
