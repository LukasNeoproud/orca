import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { ResponseCommentPopover } from '../response-comments/ResponseCommentPopover'
import { formatAiResponseComments } from '../../../../shared/ai-response-comments'
import { useTerminalCommentSelection } from './use-terminal-comment-selection'
import { isTerminalPanePasteTargetCurrent } from './terminal-paste-target-state'
import { resolveProtectedMultilinePasteOptionsForPane } from './terminal-agent-paste-bracketing'
import { resolveTerminalInputHostPlatform } from './terminal-input-host-platform'
import {
  executeTerminalPaneMenuPasteText,
  type TerminalPaneMenuPasteContext
} from './terminal-pane-menu-paste'

export function TerminalResponseComments({
  panes,
  hiddenLeafId,
  context
}: {
  panes: readonly ManagedPane[]
  hiddenLeafId: string | null
  context: TerminalPaneMenuPasteContext
}): React.JSX.Element {
  return (
    <>
      {panes.map((pane) =>
        pane.leafId === hiddenLeafId ? null : (
          <TerminalResponseComment key={pane.leafId} pane={pane} context={context} />
        )
      )}
    </>
  )
}

export function TerminalResponseComment({
  pane,
  context
}: {
  pane: ManagedPane
  context: TerminalPaneMenuPasteContext
}): React.JSX.Element {
  const { selection, onEditingChange, dismiss } = useTerminalCommentSelection(
    pane,
    context.paneTransportsRef
  )
  return (
    <ResponseCommentPopover
      selection={selection}
      submitLabel={translate('components.response-comments.insertIntoPrompt', 'Insert into prompt')}
      onEditingChange={onEditingChange}
      onDismiss={dismiss}
      onSave={async (comment) => {
        if (
          !selection ||
          !isTerminalPanePasteTargetCurrent({
            manager: context.managerRef.current,
            paneTransports: context.paneTransportsRef.current,
            paneId: pane.id,
            leafId: pane.leafId,
            transport: selection.transport,
            ptyId: selection.ptyId
          })
        ) {
          context.onPasteError(
            translate(
              'components.response-comments.terminalChanged',
              'Comment could not be inserted: the terminal is disconnected or has changed.'
            )
          )
          return false
        }
        const state = useAppStore.getState()
        const clientPlatform = getShortcutPlatform()
        const options = resolveProtectedMultilinePasteOptionsForPane({
          isWindowsClient: context.forceBracketedMultilineTextPaste,
          hostPlatform: resolveTerminalInputHostPlatform({
            clientPlatform,
            state,
            worktreeId: context.worktreeId,
            transport: selection.transport
          }),
          agentStatusByPaneKey: state.agentStatusByPaneKey,
          paneForegroundAgentByPaneKey: state.paneForegroundAgentByPaneKey,
          tabId: context.tabId,
          leafId: pane.leafId
        }) ?? { forceBracketedPasteForMultiline: true }
        const text = formatAiResponseComments([{ id: '', quote: selection.quote, comment }])
        const pasted = await executeTerminalPaneMenuPasteText(
          context,
          pane,
          'programmatic',
          `\n${text}`,
          options
        )
        if (pasted) {
          pane.terminal.clearSelection()
          dismiss()
          pane.terminal.focus()
        }
        return pasted
      }}
    />
  )
}
