import { useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { requestClaudeSessionControl } from '@/runtime/claude-session-control-client'
import { useStructuredAgentSessionHostCapability } from '@/runtime/structured-agent-session-host-capability'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY } from '../../../../shared/structured-agent-session-surface-capabilities'
import { NativeChatClaudeMcpDialog } from './NativeChatClaudeMcpDialog'
import { NativeChatClaudePermissionsDialog } from './NativeChatClaudePermissionsDialog'
import { NativeChatClaudeSideQuestionDialog } from './NativeChatClaudeSideQuestionDialog'
import {
  NativeChatClaudeControlsContext,
  type NativeChatClaudeControls
} from './native-chat-claude-controls-context'

type Panel = { kind: 'mcp' } | { kind: 'permissions' } | { kind: 'side'; question: string }

/** Answers `/mcp`, `/permissions` and `/btw` in a Claude chat with panels of its own, on a host that can. */
export function NativeChatClaudeControlsProvider({
  session,
  children
}: {
  session: { sessionId: string; agent: AgentType; target: RuntimeClientTarget }
  children: React.ReactNode
}): React.JSX.Element {
  const { sessionId, target } = session
  const supported =
    useStructuredAgentSessionHostCapability(
      target,
      AGENT_SESSION_CLAUDE_CONTROL_RUNTIME_CAPABILITY
    ) && session.agent === 'claude'
  const [panel, setPanel] = useState<Panel | null>(null)
  const controls = useMemo<NativeChatClaudeControls | undefined>(() => {
    if (!supported) {
      return undefined
    }
    const open = (next: Panel) => () => {
      setPanel(next)
      return { accepted: true, error: null }
    }
    return {
      commands: {
        mcp: open({ kind: 'mcp' }),
        permissions: open({ kind: 'permissions' }),
        'allowed-tools': open({ kind: 'permissions' }),
        btw: (question) => {
          if (!question) {
            return {
              accepted: false,
              error: translate(
                'components.native-chat.claudeControls.sideEmpty',
                'Type the question after /btw.'
              )
            }
          }
          setPanel({ kind: 'side', question })
          return { accepted: true, error: null }
        }
      },
      suggestions: [
        {
          name: 'mcp',
          description: translate(
            'components.native-chat.claudeControls.mcp.command',
            'Manage MCP servers'
          )
        },
        {
          name: 'permissions',
          description: translate(
            'components.native-chat.claudeControls.permissions.command',
            'View and edit permission rules'
          )
        },
        {
          name: 'btw',
          description: translate(
            'components.native-chat.claudeControls.sideCommand',
            'Ask a side question without adding it to the conversation'
          ),
          argumentHint: '<question>'
        }
      ],
      backgroundTool: (toolUseId) =>
        requestClaudeSessionControl(target, sessionId, { kind: 'background-tool', toolUseId }).then(
          (reply) => reply.backgrounded,
          () => false
        )
    }
  }, [sessionId, supported, target])
  const close = (): void => setPanel(null)
  return (
    <NativeChatClaudeControlsContext.Provider value={controls}>
      {children}
      {panel?.kind === 'mcp' ? (
        <NativeChatClaudeMcpDialog target={target} sessionId={sessionId} onClose={close} />
      ) : null}
      {panel?.kind === 'permissions' ? (
        <NativeChatClaudePermissionsDialog target={target} sessionId={sessionId} onClose={close} />
      ) : null}
      {panel?.kind === 'side' ? (
        <NativeChatClaudeSideQuestionDialog
          target={target}
          sessionId={sessionId}
          question={panel.question}
          onClose={close}
        />
      ) : null}
    </NativeChatClaudeControlsContext.Provider>
  )
}
