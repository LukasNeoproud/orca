import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { useMemo, useState, type ReactNode } from 'react'
import type {
  PortableConversationSource,
  PortableConversationSourceAnchor
} from '../../../../shared/portable-conversation-source'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { NativeChatMessageList } from './NativeChatMessageList'
import type { NativeChatLiveSession } from './use-native-chat-live-session'
import { usePortableConversationSourcePages } from './use-portable-conversation-source-pages'
import { StructuredTopicIndexPanel } from './StructuredTopicIndexPanel'
import { portableConversationTopicItems } from './portable-conversation-topic-items'
import { usePortableConversationTopicIndex } from './use-portable-conversation-topic-index'
import { PortableTaskProposalPanel } from './PortableTaskProposalPanel'

export type PortableConversationSourceSelection = {
  source: PortableConversationSource
  anchor: PortableConversationSourceAnchor
  message: NativeChatMessage
}

const NOOP = (): void => undefined

function hostLabel(executionHostId: PortableConversationSource['executionHostId']): string {
  return executionHostId.slice('ssh:'.length)
}

export function PortableConversationSourceDialog({
  target,
  source,
  initialAnchor,
  onClose,
  onSelect,
  open = true,
  children,
  onFamilyChanged
}: {
  open?: boolean
  children?: ReactNode
  onFamilyChanged?: () => void
  target: RuntimeClientTarget
  source: PortableConversationSource
  initialAnchor?: PortableConversationSourceAnchor
  onClose: () => void
  onSelect: (selection: PortableConversationSourceSelection) => void
}): React.JSX.Element {
  const {
    state,
    loadNext,
    showBeginning,
    showAnchor,
    showExternalAnchor,
    anchorFor,
    selectionFor
  } = usePortableConversationSourcePages({
    target,
    source,
    initialAnchor
  })
  const [scrollRequestId, setScrollRequestId] = useState(0)
  const [topicNavigationError, setTopicNavigationError] = useState<string | null>(null)
  const topics = usePortableConversationTopicIndex({
    target,
    source,
    visible: open,
    observationKey: state.verified
      ? JSON.stringify([state.identity, [...state.completedAssistantMessageIds]])
      : null
  })
  const topicItems = useMemo(
    () =>
      portableConversationTopicItems({
        index: topics.index,
        anchors: topics.anchors,
        positions: topics.positions,
        messages: state.messages
      }),
    [state.messages, topics.anchors, topics.index, topics.positions]
  )
  const topicEpoch = topics.index.chapters.at(-1)?.end.epoch ?? null
  const sourceViewStateKey = useMemo(
    () =>
      JSON.stringify([
        'portable-source',
        target,
        source.executionHostId,
        source.provider,
        source.transcriptPath,
        state.activeAnchor ?? null
      ]),
    [source.executionHostId, source.provider, source.transcriptPath, state.activeAnchor, target]
  )
  const session = useMemo<NativeChatLiveSession>(
    () => ({
      messages: state.messages,
      status: state.error ? 'error' : state.loading ? 'loading' : 'ready',
      sessionId: source.provider.sessionId,
      agent: source.provider.agent,
      hasMore: false,
      loadingEarlier: false,
      loadEarlier: NOOP,
      readPhase: state.error ? 'error' : state.loading ? 'loading' : 'ready'
    }),
    [source.provider.agent, source.provider.sessionId, state.error, state.loading, state.messages]
  )
  const select = (message: NativeChatMessage, selectedText?: string): void => {
    if (message.role !== 'assistant' || !state.completedAssistantMessageIds.has(message.id)) {
      return
    }
    const anchor = selectionFor(message, selectedText)
    if (anchor) {
      onSelect({ source, anchor, message })
    }
  }
  const showFromBeginning = (): void => {
    showBeginning()
    setScrollRequestId((current) => current + 1)
  }
  const revealInitialAnchor = (): void => {
    showAnchor()
    setScrollRequestId((current) => current + 1)
  }
  const navigateTopic = (itemId: string): void => {
    const anchor = topics.anchors[itemId]
    if (!anchor) {
      setTopicNavigationError(
        translate(
          'conversations.portableSource.topicAnchorUnavailable',
          'This topic anchor is no longer available from the verified source.'
        )
      )
      return
    }
    setTopicNavigationError(null)
    showExternalAnchor(anchor)
    setScrollRequestId((current) => current + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(86vh,48rem)] min-h-0 flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {translate('conversations.portableSource.title', 'SSH conversation source')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversations.portableSource.description',
              'Read-only transcript evidence. Selecting a response keeps its exact source anchor.'
            )}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="min-w-0">
            <dt className="text-muted-foreground">
              {translate('conversations.portableSource.host', 'Host')}
            </dt>
            <dd className="truncate font-mono text-foreground">
              {hostLabel(source.executionHostId)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">
              {translate('conversations.portableSource.workspace', 'Workspace')}
            </dt>
            <dd className="truncate font-mono text-foreground">{source.workspace.path}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">
              {translate('conversations.portableSource.agent', 'Agent')}
            </dt>
            <dd className="text-foreground">
              {source.provider.agent === 'codex' ? 'Codex' : 'Claude'}
            </dd>
          </div>
        </dl>
        {children}
        <PortableTaskProposalPanel
          target={target}
          source={source}
          messages={state.messages}
          anchorFor={anchorFor}
          onFamilyChanged={onFamilyChanged}
        />
        <StructuredTopicIndexPanel
          index={topics.index}
          items={topicItems}
          epoch={topicEpoch}
          error={topics.error ?? topicNavigationError}
          onNavigate={(anchor) => navigateTopic(anchor.itemId)}
          onSave={(index) => {
            void topics.save(index).catch(() => undefined)
          }}
          onLoadOlder={() => {
            void topics.loadMore()
          }}
        />
        <div className="flex justify-end gap-2 px-3 pb-1">
          {topics.limited ? (
            <Button
              variant="outline"
              size="xs"
              disabled={topics.loading}
              onClick={() => void topics.loadMore()}
            >
              {translate('conversations.portableSource.loadMoreTopics', 'Load more topics')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            disabled={topics.loading}
            onClick={() => void topics.refresh()}
          >
            {translate('conversations.portableSource.refreshTopics', 'Refresh topics')}
          </Button>
        </div>
        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            {state.error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 rounded-md border border-border bg-background">
          <NativeChatMessageList
            viewStateKey={sourceViewStateKey}
            session={session}
            isWorking={false}
            expandSignal={false}
            fontScale={1}
            showTurnStatus={false}
            scrollToMessageId={state.activeAnchor?.messageId ?? null}
            scrollRequestId={scrollRequestId}
            onBranchMessage={select}
            branchableMessageIds={state.completedAssistantMessageIds}
          />
        </div>
        <DialogFooter className="shrink-0">
          {initialAnchor ? (
            <Button variant="ghost" size="sm" onClick={showFromBeginning} disabled={state.loading}>
              {translate('conversations.portableSource.showBeginning', 'Show from beginning')}
            </Button>
          ) : null}
          {initialAnchor ? (
            <Button
              variant="outline"
              size="sm"
              onClick={revealInitialAnchor}
              disabled={state.loading}
            >
              {translate('conversations.portableSource.showSelected', 'Show selected response')}
            </Button>
          ) : null}
          {state.nextCursor ? (
            <Button variant="outline" size="sm" onClick={loadNext} disabled={state.loading}>
              {state.loading
                ? translate('conversations.portableSource.loading', 'Loading messages…')
                : translate('conversations.portableSource.loadNext', 'Load next messages')}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onClose}>
            {translate('conversations.portableSource.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
