import { useEffect, useState } from 'react'
import {
  consumeConversationAnchorRequest,
  useConversationAnchorRequest
} from '@/lib/conversation-family-navigation'
import { useConversationFamily } from './use-conversation-family'
import { ConversationFamilyPanel } from './ConversationFamilyPanel'
import { useStructuredTopicIndexNavigation } from './use-structured-topic-index-navigation'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { useStructuredAgentSession } from './use-structured-agent-session'
import { useNativeChatFileLinkContext } from './use-native-chat-file-link-context'
import { StructuredTaskProposalPanel } from './StructuredTaskProposalPanel'

function isProposalAgent(agent: string): agent is 'claude' | 'codex' {
  return agent === 'claude' || agent === 'codex'
}

export function useConversationTools(
  props: Omit<NativeChatStructuredViewProps, 'mode'>,
  controller: ReturnType<typeof useStructuredAgentSession>
) {
  const family = useConversationFamily(
    props.target,
    props.sessionId,
    controller.epoch,
    props.isVisible
  )
  const workspace = useNativeChatFileLinkContext(props.tabId)
  const proposalAgent = isProposalAgent(props.agent) ? props.agent : null
  const topics = useStructuredTopicIndexNavigation({
    sessionId: props.sessionId,
    target: props.target,
    visible: props.isVisible,
    items: controller.items,
    epoch: controller.epoch,
    loadOlder: controller.loadOlder
  })
  const external = useConversationAnchorRequest(props.target, props.sessionId)
  const [scrollRequest, setScrollRequest] = useState<{
    anchor: { epoch: string; itemId: string }
    requestId: number
  } | null>(topics.scrollRequest)
  useEffect(() => {
    if (topics.scrollRequest) {
      setScrollRequest(topics.scrollRequest)
    }
  }, [topics.scrollRequest])
  useEffect(() => {
    if (external) {
      setScrollRequest({
        anchor: { epoch: external.epoch, itemId: external.itemId },
        requestId: -external.sequence
      })
      consumeConversationAnchorRequest(props.target, props.sessionId, external.sequence)
    }
  }, [external, props.target, props.sessionId])
  const last = controller.messages.findLast((message) => message.role === 'assistant')
  const latestResponse =
    last?.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n') ?? ''
  return {
    scrollRequest,
    branchMessage: family.branchMessage,
    panel: (
      <>
        {topics.panel}
        {workspace && proposalAgent ? (
          <StructuredTaskProposalPanel
            target={props.target}
            sessionId={props.sessionId}
            workspaceId={workspace.worktreeId}
            agent={proposalAgent}
            epoch={controller.epoch}
            items={controller.items}
            isWorking={controller.isWorking}
            visible={props.isVisible}
            family={family.family}
            refreshFamily={family.refresh}
          />
        ) : null}
        <ConversationFamilyPanel
          controller={family}
          sessionId={props.sessionId}
          target={props.target}
          latestResponse={latestResponse}
        />
      </>
    )
  }
}
