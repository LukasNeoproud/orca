import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { dispatchStructuredAgentSessionComposerCommand } from '../../../../shared/structured-agent-session-composer'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { Button } from '@/components/ui/button'
import { NativeChatComposer, type NativeChatComposerHandle } from './NativeChatComposer'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { NativeChatMessageList } from './NativeChatMessageList'
import { selectNativeChatViewState } from './native-chat-view-state'
import { useNativeChatFontScale } from './use-native-chat-font-scale'
import { LinkActionPopover } from '@/components/link-actions/LinkActionPopover'
import { useNativeChatLinkActions } from './use-native-chat-link-actions'
import { useNativeChatFileLinkContext } from './use-native-chat-file-link-context'
import { useStructuredAgentSession } from './use-structured-agent-session'
import { translate } from '@/i18n/i18n'
import { useNativeChatImageRuntimeContext } from './native-chat-image-runtime-context'
import { useStructuredNativeChatPaneCommands } from './use-structured-native-chat-pane-commands'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import { NativeChatBackgroundTasksStatus } from './NativeChatBackgroundTasksStatus'
import { StructuredAgentSessionHandoffChrome } from './StructuredAgentSessionHandoffChrome'
import { useConversationTools } from './use-conversation-tools'
import { NativeChatStructuredPromptCard } from './NativeChatStructuredPromptCard'
import { ConversationContinuationPanel } from '@/components/agent-session-continuation/ConversationContinuationPanel'
import { AgentContextRequestStatus } from '@/components/agent-session-continuation/AgentContextRequestStatus'
import { startStructuredAgentLaunch } from '@/lib/structured-agent-session-launch'
import {
  adoptStructuredSessionComposerDraft,
  stageStructuredSessionComposerDraft
} from './structured-agent-session-draft-transfer'

type StoppingBackgroundTasks = {
  sessionId: string
  taskIds: ReadonlySet<string>
  all: boolean
}

const NO_STOPPING_TASKS: ReadonlySet<string> = new Set()

export function NativeChatStructuredSession(
  props: Omit<NativeChatStructuredViewProps, 'mode'>
): React.JSX.Element {
  const controller = useStructuredAgentSession(props)
  const {
    panel: topicPanel,
    scrollRequest: topicScrollRequest,
    branchMessage
  } = useConversationTools(props, controller)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [stoppingBackgroundTasks, setStoppingBackgroundTasks] =
    useState<StoppingBackgroundTasks | null>(null)
  const [optionPickerRequest, setOptionPickerRequest] = useState<{
    id: string
    sequence: number
  } | null>(null)
  const paneKey = useMemo(
    () => props.composerPaneKey ?? structuredAgentSessionPaneKey(props.tabId, props.sessionId),
    [props.composerPaneKey, props.sessionId, props.tabId]
  )
  const draftAdoptionKey = `${paneKey}\u0000${props.sessionId}`
  const [adoptedDraftKey, setAdoptedDraftKey] = useState<string | null>(null)
  const composerDraftReady = adoptedDraftKey === draftAdoptionKey
  useLayoutEffect(() => {
    adoptStructuredSessionComposerDraft({ targetPaneKey: paneKey, sessionId: props.sessionId })
    setAdoptedDraftKey(draftAdoptionKey)
  }, [draftAdoptionKey, paneKey, props.sessionId])
  const messageListViewStateKey = useMemo(
    () =>
      JSON.stringify([
        props.target.kind,
        props.target.kind === 'environment' ? props.target.environmentId : null,
        props.sessionId
      ]),
    [props.sessionId, props.target]
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<NativeChatComposerHandle>(null)
  const paneCommands = useStructuredNativeChatPaneCommands({
    tabId: props.tabId,
    groupId: props.groupId,
    isVisible: props.isVisible,
    rootRef,
    composerRef,
    terminalPaneActions: props.contextMenuActions
  })
  const session = useMemo<NativeChatLiveSession>(
    () => ({
      messages: controller.messages,
      status:
        controller.status === 'error'
          ? 'error'
          : controller.status === 'loading'
            ? 'loading'
            : controller.isWorking
              ? 'working'
              : controller.messages.length === 0
                ? 'empty'
                : 'ready',
      sessionId: props.sessionId,
      agent: props.agent,
      ...(controller.error ? { error: controller.error } : {}),
      hasMore: controller.hasOlder,
      loadingEarlier: controller.loadingOlder,
      loadEarlier: () => void controller.loadOlder(),
      readPhase:
        controller.status === 'loading'
          ? 'loading'
          : controller.status === 'error'
            ? 'error'
            : 'ready'
    }),
    [controller, props.agent, props.sessionId]
  )
  const viewState = selectNativeChatViewState(session)
  const fontScale = useNativeChatFontScale(viewState.kind === 'ready')
  const fileLinkContext = useNativeChatFileLinkContext(props.tabId)
  const imageRuntimeContext = useNativeChatImageRuntimeContext(props.tabId)
  const insertLinkReference = useCallback((text: string) => {
    composerRef.current?.insertTypedText(text)
  }, [])
  const { onLinkClick, linkActionRequest, closeLinkActions } = useNativeChatLinkActions(
    fileLinkContext,
    rootRef,
    { sessionId: props.sessionId, isVisible: props.isVisible, insertReference: insertLinkReference }
  )
  const activeStoppingBackgroundTasks =
    stoppingBackgroundTasks?.sessionId === props.sessionId ? stoppingBackgroundTasks : null
  const prompt = controller.prompts[0] ?? null
  const continuationSource = useMemo(() => {
    const providerSession = controller.providerSession
    return props.agent === 'codex' && providerSession?.key === 'session_id'
      ? {
          providerSessionId: providerSession.id,
          workspaceId: props.worktreeId,
          target: props.target,
          sessionId: props.sessionId
        }
      : null
  }, [controller.providerSession, props.agent, props.sessionId, props.target, props.worktreeId])
  const continueConversation = useCallback(
    async (
      mode: 'original' | 'compacted' | 'reference' | 'fresh',
      candidate?: { providerSessionId: string; transcriptPath: string },
      reference?: string
    ): Promise<void> => {
      if (mode === 'original') {
        return
      }
      const launch = startStructuredAgentLaunch(props.worktreeId, 'codex', {
        target: props.target,
        ...(mode === 'compacted' && candidate
          ? { resumeFrom: { providerSessionId: candidate.providerSessionId } }
          : {})
      })
      stageStructuredSessionComposerDraft({
        sourcePaneKey: paneKey,
        targetSessionId: launch.sessionId,
        ...(mode === 'reference' && reference ? { prefix: reference } : {})
      })
      await launch.launchResult
    },
    [paneKey, props.target, props.worktreeId]
  )
  const retryableOutboxEntry =
    controller.outbox.find((entry) => entry.state === 'unconfirmed') ??
    controller.outbox.find(
      (entry) => entry.clientMessageId === controller.blockedClientMessageId
    ) ??
    null
  const structuredTransport = useMemo(
    () => ({
      send: (text: string, attachments: readonly { id: string; path: string }[]): boolean =>
        controller.send(
          text,
          attachments.map((attachment) => ({
            path: attachment.path,
            previewUri: attachment.path
          }))
        ),
      dispatchCommand: (text: string) =>
        dispatchStructuredAgentSessionComposerCommand(text, {
          agent: props.agent,
          snapshot: controller.optionSnapshot,
          invokeAction: async (id) => {
            setOptionPickerRequest((current) => ({ id, sequence: (current?.sequence ?? 0) + 1 }))
            return true
          },
          setOption: controller.setStructuredOption,
          conversationCommands: controller.conversationCommands,
          runConversationCommand: controller.runConversationCommand
        }),
      optionsSurface: controller.optionSurface,
      conversationCommands: controller.conversationCommands,
      optionSnapshot: controller.optionSnapshot,
      optionPickerRequest,
      sessionCommands: controller.sessionCommands,
      worktreeId: fileLinkContext?.worktreeId,
      onError: setComposerError,
      runtime: (props.target.kind === 'local' ? 'local' : 'remote') as 'local' | 'remote',
      sessionId: props.sessionId,
      runtimeEnvironmentId:
        props.target.kind === 'local' ? null : (props.target.environmentId ?? null)
    }),
    [
      controller,
      fileLinkContext?.worktreeId,
      optionPickerRequest,
      props.agent,
      props.sessionId,
      props.target
    ]
  )

  return (
    <div
      ref={rootRef}
      data-native-chat-root="true"
      data-native-chat-working={controller.isWorking ? 'true' : 'false'}
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        if (event.button === 2) {
          paneCommands.onSelectionCapture()
        }
      }}
      onMouseUpCapture={paneCommands.onSelectionCapture}
      onKeyUpCapture={paneCommands.onSelectionCapture}
      onKeyDownCapture={paneCommands.onKeyDownCapture}
      onContextMenuCapture={paneCommands.onContextMenuCapture}
      className="flex h-full min-h-0 w-full flex-col bg-background focus:outline-none"
    >
      <StructuredAgentSessionHandoffChrome
        status={controller.handoff}
        isWorking={controller.isWorking}
        onRequest={(direction, mode, action) => {
          void controller.requestHandoff(direction, mode, action)
        }}
      />
      {continuationSource ? <AgentContextRequestStatus source={continuationSource} /> : null}
      {continuationSource ? (
        <ConversationContinuationPanel
          source={continuationSource}
          busy={controller.isWorking || prompt !== null}
          onContinue={continueConversation}
        />
      ) : null}
      {topicPanel}
      <div className="flex min-h-0 flex-1 flex-col">
        {viewState.kind === 'loading' ? (
          <NativeChatEmptyState kind="loading" />
        ) : viewState.kind === 'error' ? (
          <NativeChatEmptyState kind="error" message={viewState.message} />
        ) : viewState.kind === 'empty' ? (
          <NativeChatEmptyState kind="empty" agent={props.agent} />
        ) : (
          <NativeChatMessageList
            key={messageListViewStateKey}
            session={session}
            isWorking={controller.isWorking}
            expandSignal={false}
            fontScale={fontScale.scale}
            workingStartedAt={null}
            showTurnStatus
            turnActivity={controller.turnActivity}
            onLinkClick={onLinkClick}
            allowFileUriLinks={onLinkClick !== undefined}
            runtimeContext={imageRuntimeContext}
            scrollToMessageId={topicScrollRequest?.anchor.itemId}
            scrollToMessageEpoch={topicScrollRequest?.anchor.epoch}
            journalEpoch={controller.epoch}
            scrollRequestId={topicScrollRequest?.requestId}
            viewStateKey={messageListViewStateKey}
            onBranchMessage={branchMessage}
          />
        )}
      </div>
      <NativeChatStructuredPromptCard
        prompt={prompt}
        turnId={controller.turnId}
        onRespond={(answer) => {
          if (prompt) {
            void controller.respond(prompt, answer)
          }
        }}
        onCancel={(turnId) => {
          void controller.cancel(turnId)
        }}
      />
      {retryableOutboxEntry ? (
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-1 text-xs text-muted-foreground">
          <span>
            {retryableOutboxEntry.state === 'unconfirmed'
              ? translate(
                  'auto.components.native.chat.NativeChatStructuredSession.1f772bb5d0',
                  'Message delivery is unconfirmed.'
                )
              : translate(
                  'auto.components.native.chat.NativeChatStructuredSession.93ef441197',
                  'Message was not sent.'
                )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => controller.retry(retryableOutboxEntry.clientMessageId)}
          >
            <RotateCcw className="size-3" />
            {translate(
              'auto.components.native.chat.NativeChatStructuredSession.a5e7f14068',
              'Retry'
            )}
          </Button>
        </div>
      ) : null}
      {controller.error || composerError ? (
        <p className="mx-auto w-full max-w-4xl px-4 py-1 text-xs text-destructive">
          {controller.error ?? composerError}
        </p>
      ) : null}
      {controller.isMonitoringBackgroundTasks ? (
        <NativeChatBackgroundTasksStatus
          tasks={controller.backgroundTasks}
          supportsTaskStop={controller.supportsBackgroundTaskStop}
          stoppingTaskIds={activeStoppingBackgroundTasks?.taskIds ?? NO_STOPPING_TASKS}
          stoppingAll={activeStoppingBackgroundTasks?.all ?? false}
          onStop={(taskId) => {
            const targetSessionId = props.sessionId
            setStoppingBackgroundTasks((current) => {
              const taskIds = new Set(
                current?.sessionId === targetSessionId ? current.taskIds : NO_STOPPING_TASKS
              )
              if (taskId) {
                taskIds.add(taskId)
              }
              return {
                sessionId: targetSessionId,
                taskIds,
                all: taskId ? current?.sessionId === targetSessionId && current.all : true
              }
            })
            void controller.stopBackgroundTask(taskId).finally(() => {
              setStoppingBackgroundTasks((current) => {
                if (current?.sessionId !== targetSessionId) {
                  return current
                }
                const taskIds = new Set(current.taskIds)
                if (taskId) {
                  taskIds.delete(taskId)
                }
                const all = taskId ? current.all : false
                return taskIds.size === 0 && !all
                  ? null
                  : { sessionId: targetSessionId, taskIds, all }
              })
            })
          }}
        />
      ) : null}
      {prompt || !composerDraftReady ? null : (
        <NativeChatComposer
          ref={composerRef}
          terminalTabId={props.tabId}
          paneKey={paneKey}
          targetPtyId={null}
          agent={props.agent}
          canSend={!prompt && controller.canSend}
          isWorking={controller.isWorking}
          onStop={() => {
            if (controller.turnId) {
              void controller.cancel(controller.turnId)
            }
          }}
          structuredTransport={structuredTransport}
        />
      )}
      {paneCommands.menu}
      <LinkActionPopover request={linkActionRequest} onClose={closeLinkActions} />
    </div>
  )
}
