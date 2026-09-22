import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { WorkspaceCombobox } from '@/components/automations/WorkspaceCombobox'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { translate } from '@/i18n/i18n'
import type { BacklogRoute } from '@/lib/backlog-rpc'
import type { BacklogTask } from '../../../../shared/backlog-types'
import type { BacklogTaskAssociation } from '../../../../shared/backlog-task-association'
import { readBacklogTaskAssociation } from '@/lib/backlog-task-association-client'
import {
  getBacklogTaskWorkspaceOptions,
  getBacklogTaskConversationOptions,
  startBacklogTask,
  type BacklogTaskConversationOption
} from '@/lib/backlog-task-handoff'
import { closeBacklogTaskStart } from './backlog-task-start-request'
import { BacklogConversationPicker } from './BacklogConversationPicker'
import { BacklogTaskWorktreeComposer } from './BacklogTaskWorktreeComposer'
import { useStructuredAgentLaunchSupport } from '@/components/native-chat/use-structured-agent-launch-support'
import { useBacklogTaskAgent } from './use-backlog-task-agent'

const NEW_CONVERSATION = 'new'
const NEW_CHAT = 'new-chat'
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export default function BacklogTaskStartDialog({
  request
}: {
  request: { route: BacklogRoute; task: BacklogTask }
}): React.JSX.Element {
  const { route, task } = request
  const [workspaceId, setWorkspaceId] = useState(route.workspaceId)
  const [newWorktree, setNewWorktree] = useState(false)
  const [conversationId, setConversationId] = useState(NEW_CONVERSATION)
  const [conversations, setConversations] = useState<BacklogTaskConversationOption[]>([])
  const [association, setAssociation] = useState<BacklogTaskAssociation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'confirmed' | 'unverified' | null>(null)
  const inFlight = useRef(false)
  const creationAgent = useRef<TuiAgent | null>(null)
  const creationSurface = useRef<'structured' | undefined>(undefined)
  const targetRoute = { ...route, workspaceId }
  const agentSelection = useBacklogTaskAgent(targetRoute)
  const chatSupport = useStructuredAgentLaunchSupport(workspaceId)
  const chatAgents = agentSelection.agents.filter(
    (agent) =>
      route.executionHostId === 'local' &&
      (agent.id === 'claude' || agent.id === 'codex') &&
      chatSupport[agent.id]
  )
  const isNewConversation = conversationId === NEW_CONVERSATION || conversationId === NEW_CHAT
  const availableAgents = conversationId === NEW_CHAT ? chatAgents : agentSelection.agents
  const effectiveAgent =
    conversationId === NEW_CHAT
      ? (chatAgents.find((agent) => agent.id === agentSelection.agent)?.id ??
        chatAgents[0]?.id ??
        null)
      : agentSelection.agent
  const workspaces = getBacklogTaskWorkspaceOptions(route)
  const source = workspaces.find((workspace) => workspace.id === route.workspaceId)
  const sourceRepo = useAppStore((state) =>
    source
      ? findRepoForHost(state.repos, source.repoId, {
          hostId: route.executionHostId,
          settings: state.settings
        })
      : null
  )
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    void Promise.all([
      readBacklogTaskAssociation(route, task.id),
      getBacklogTaskConversationOptions({ ...route, workspaceId })
    ])
      .then(([saved, options]) => {
        if (!current) {
          return
        }
        setAssociation(saved)
        setConversations(options)
        setError(null)
      })
      .catch((failure) => {
        if (current) {
          setError(message(failure))
        }
      })
      .finally(() => {
        if (current) {
          setLoading(false)
        }
      })
    return () => {
      current = false
    }
  }, [route, task.id, workspaceId, reload])

  const submit = async (
    createdWorkspaceId?: string,
    selectedAgent = effectiveAgent,
    surface: 'structured' | undefined = conversationId === NEW_CHAT ? 'structured' : undefined
  ): Promise<void> => {
    if (inFlight.current || loading || result) {
      return
    }
    const existing = createdWorkspaceId
      ? undefined
      : conversations.find((conversation) => conversation.id === conversationId)
    if (!createdWorkspaceId && !isNewConversation && !existing) {
      setError(
        translate(
          'components.backlog.selectedConversationUnavailable',
          'The selected conversation is unavailable. Choose another conversation.'
        )
      )
      return
    }
    if (!existing && !selectedAgent) {
      setError(
        translate(
          'components.backlog.chooseAgent',
          'Choose an available agent before starting the task.'
        )
      )
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const outcome = await startBacklogTask({
        sourceRoute: route,
        taskId: task.id,
        targetRoute: createdWorkspaceId
          ? { ...route, workspaceId: createdWorkspaceId }
          : targetRoute,
        conversation: existing
          ? { kind: 'existing', conversation: existing }
          : { kind: 'new', agent: selectedAgent!, ...(surface ? { surface } : {}) },
        expectedAttemptId: association?.attemptId ?? null
      })
      setAssociation(outcome.association)
      setResult(outcome.status)
    } catch (failure) {
      setError(message(failure))
      // A lost reply can leave a durable attempt; never expose an automatic resend.
      try {
        const saved = await readBacklogTaskAssociation(route, task.id)
        if (saved && saved.attemptId !== association?.attemptId) {
          setAssociation(saved)
          setResult('unverified')
        }
      } catch {
        setResult('unverified')
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const chooseWorkspace = (id: string): void => {
    setWorkspaceId(id)
    setConversationId(NEW_CONVERSATION)
    setLoading(true)
    setConversations([])
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !newWorktree) {
          closeBacklogTaskStart()
        }
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!busy && !newWorktree}
        onInteractOutside={(event) => {
          if (busy || newWorktree) {
            event.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{translate('components.backlog.startTask', 'Start task')}</DialogTitle>
          <DialogDescription className="break-words">
            {task.id} · {task.title}
          </DialogDescription>
        </DialogHeader>
        {newWorktree ? (
          <BacklogTaskWorktreeComposer
            sourceRoute={route}
            taskTitle={task.title}
            onCancel={() => setNewWorktree(false)}
            onCreated={(id) => {
              setWorkspaceId(id)
              setConversationId(NEW_CONVERSATION)
              setNewWorktree(false)
              void submit(id, creationAgent.current, creationSurface.current)
            }}
          />
        ) : result ? (
          <p role="status" className="text-sm">
            {result === 'confirmed'
              ? translate('components.backlog.handoffConfirmed', 'Task handed to the conversation.')
              : translate(
                  'components.backlog.handoffUnverified',
                  'Delivery is unverified. Check the linked conversation before sending again. Continue will not resend the task.'
                )}
          </p>
        ) : (
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="space-y-2">
              <Label>{translate('components.backlog.workspace', 'Workspace')}</Label>
              <WorkspaceCombobox
                worktrees={workspaces}
                value={workspaceId}
                onValueChange={chooseWorkspace}
              />
              {source &&
              !source.id.startsWith('folder:') &&
              sourceRepo &&
              isGitRepoKind(sourceRepo) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading || Boolean(error) || !effectiveAgent}
                  onClick={() => {
                    creationAgent.current = effectiveAgent
                    creationSurface.current = conversationId === NEW_CHAT ? 'structured' : undefined
                    if (!isNewConversation) {
                      setConversationId(NEW_CONVERSATION)
                    }
                    setNewWorktree(true)
                  }}
                >
                  {translate('components.backlog.newWorktree', 'New worktree')}
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{translate('components.backlog.conversation', 'Conversation')}</Label>
              <BacklogConversationPicker
                value={conversationId}
                onChange={setConversationId}
                choices={[
                  {
                    id: NEW_CONVERSATION,
                    label: translate('components.backlog.newConversation', 'New conversation')
                  },
                  ...(chatAgents.length
                    ? [{ id: NEW_CHAT, label: translate('components.backlog.newChat', 'New chat') }]
                    : []),
                  ...conversations.map((conversation) => ({
                    id: conversation.id,
                    label: conversation.title
                  }))
                ]}
              />
            </div>
            {isNewConversation ? (
              <div className="space-y-2">
                <Label>{translate('components.backlog.agent', 'Agent')}</Label>
                <AgentCombobox
                  agents={availableAgents}
                  value={effectiveAgent}
                  onValueChange={agentSelection.setAgent}
                  defaultAgent={agentSelection.defaultAgent}
                  allowBlankTerminal={false}
                  allowNarrowTrigger
                  triggerClassName="w-full"
                />
                {!agentSelection.isLoading && availableAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {agentSelection.detectionFailed
                      ? translate(
                          'components.backlog.agentsUnavailable',
                          'Could not check agents on this host.'
                        )
                      : translate(
                          'components.backlog.noAgents',
                          'No available agents on this host.'
                        )}
                    <Button
                      size="xs"
                      variant="link"
                      onClick={() =>
                        void agentSelection.refresh().catch((failure) => setError(message(failure)))
                      }
                    >
                      {translate('components.backlog.refreshAgents', 'Refresh agents')}
                    </Button>
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {translate(
                'components.backlog.normalSend',
                'The task is sent immediately using the conversation’s normal send behavior.'
              )}
            </p>
          </fieldset>
        )}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {!newWorktree ? (
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={closeBacklogTaskStart}>
              {result
                ? translate('components.backlog.close', 'Close')
                : translate('components.backlog.cancel', 'Cancel')}
            </Button>
            {error && !result ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setLoading(true)
                  setReload((value) => value + 1)
                }}
              >
                {translate('components.backlog.retry', 'Retry')}
              </Button>
            ) : null}
            {!result ? (
              <Button
                className="w-32"
                disabled={
                  busy || loading || Boolean(error) || (isNewConversation && !effectiveAgent)
                }
                onClick={() => void submit()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {translate('components.backlog.handingOff', 'Sending…')}
                  </>
                ) : (
                  translate('components.backlog.startTask', 'Start task')
                )}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
