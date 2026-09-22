import { conversationBranchError } from '@/lib/conversation-branch-error'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TaskWorktreeComposer } from '@/components/new-workspace/TaskWorktreeComposer'
import { translate } from '@/i18n/i18n'
import { getBacklogTaskWorkspaceOptions } from '@/lib/backlog-task-handoff-options'
import {
  branchPreparePortableConversation,
  branchPreviewPortableConversation
} from '@/lib/portable-conversation-branch-client'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { useEffect, useRef, useState } from 'react'
import type {
  PortableConversationBranchPrepareParams,
  PortableConversationBranchPreviewResult,
  PortableConversationBranchRecord
} from '../../../../shared/portable-conversation-branch'
import type { AgentSessionBranchRelationKind } from '../../../../shared/agent-session-branch'
import type { WorkspaceConversationRoute } from '@/lib/workspace-conversation-activation'
import type { PortableConversationSourceSelection } from './PortableConversationSourceDialog'
import { ConversationBranchTargetFields } from './ConversationBranchTargetFields'
import { targetedConversationHandoff } from './conversation-branch-draft'

export function PortableConversationBranchDialog({
  selection,
  target,
  sourceRoute,
  onClose,
  onPrepared
}: {
  selection: PortableConversationSourceSelection
  target: RuntimeClientTarget
  sourceRoute: WorkspaceConversationRoute
  onClose: () => void
  onPrepared: (branch: PortableConversationBranchRecord) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(
    translate('conversations.portableBranch.defaultTitle', 'Related SSH conversation')
  )
  const [workspaceId, setWorkspaceId] = useState(sourceRoute.workspaceId)
  const [relationKind, setRelationKind] = useState<AgentSessionBranchRelationKind>('discussion')
  const [mode, setMode] = useState<'history' | 'targeted'>(
    selection.anchor.selectedText ? 'targeted' : 'history'
  )
  const [preview, setPreview] = useState<PortableConversationBranchPreviewResult | null>(null)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [historyBlocked, setHistoryBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creatingWorktree, setCreatingWorktree] = useState(false)
  const [created, setCreated] = useState<PortableConversationBranchRecord | null>(null)
  const intent = useRef<PortableConversationBranchPrepareParams | null>(null)
  const workspaces = getBacklogTaskWorkspaceOptions(sourceRoute)

  useEffect(() => {
    let current = true
    setPreview(null)
    setError(null)
    void branchPreviewPortableConversation(target, {
      source: selection.source,
      anchor: selection.anchor,
      mode
    })
      .then((result) => {
        if (!current) {
          return
        }
        if (mode === 'history' && result.context.historyTruncated) {
          setHistoryBlocked(true)
          setMode('targeted')
          return
        }
        setPreview(result)
        setContent(
          mode === 'targeted'
            ? targetedConversationHandoff({ text: result.context.contextMarkdown })
            : result.context.contextMarkdown
        )
      })
      .catch((failure) => current && setError(conversationBranchError(failure)))
    return () => {
      current = false
    }
  }, [mode, selection.anchor, selection.source, target])

  const submit = async (): Promise<void> => {
    if (busy || !preview || !title.trim() || !content.trim()) {
      return
    }
    const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId)
    if (!selectedWorkspace) {
      setError(
        translate(
          'conversations.portableBranch.workspaceUnavailable',
          'The target workspace is unavailable.'
        )
      )
      return
    }
    intent.current ??= {
      branchId: crypto.randomUUID(),
      title: title.trim(),
      relationKind,
      source: selection.source,
      anchor: selection.anchor,
      target: {
        sessionId: `portable-${crypto.randomUUID()}`,
        agent: selection.source.provider.agent,
        workspaceId: selectedWorkspace.id,
        executionHostId: selection.source.executionHostId
      },
      handoff: { mode, content, sourceContextSha256: preview.contextSha256 }
    }
    setBusy(true)
    setError(null)
    try {
      const { branch } = await branchPreparePortableConversation(target, intent.current)
      setCreated(branch)
      onPrepared(branch)
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || intent.current !== null
  const cannotDismiss = busy || (intent.current !== null && !created)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !cannotDismiss && !creatingWorktree) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] min-h-0 flex-col sm:max-w-2xl"
        showCloseButton={!cannotDismiss}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('conversations.portableBranch.title', 'Prepare related SSH conversation')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversations.portableBranch.description',
              'This creates a portable copy of source evidence. It does not create a native provider fork.'
            )}
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {translate(
              'conversations.portableBranch.currentFiles',
              'The agent will use the current files in the selected workspace. Historical files are not restored; no checkout or reset is performed.'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'conversations.portableBranch.fixedAgent',
              'Source agent: {{agent}} (fixed)',
              { agent: selection.source.provider.agent === 'codex' ? 'Codex' : 'Claude' }
            )}
          </p>
        </DialogHeader>
        {creatingWorktree ? (
          <TaskWorktreeComposer
            sourceRoute={sourceRoute}
            taskTitle={title}
            onCancel={() => setCreatingWorktree(false)}
            onCreated={(id) => {
              setWorkspaceId(id)
              setCreatingWorktree(false)
            }}
          />
        ) : created ? (
          <p role="status" className="text-sm">
            {translate(
              'conversations.portableBranch.prepared',
              'Conversation prepared. Work starts only when you explicitly start it.'
            )}
          </p>
        ) : (
          <fieldset
            disabled={locked}
            className="min-h-0 space-y-4 overflow-y-auto px-1 scrollbar-sleek"
          >
            <ConversationBranchTargetFields
              title={title}
              setTitle={setTitle}
              relationKind={relationKind}
              setRelationKind={setRelationKind}
              workspaces={workspaces}
              workspaceId={workspaceId}
              setWorkspaceId={setWorkspaceId}
            />
            {selection.source.workspace.kind === 'git-worktree' ? (
              <Button variant="ghost" size="xs" onClick={() => setCreatingWorktree(true)}>
                {translate('conversations.portableBranch.newWorktree', 'New worktree')}
              </Button>
            ) : null}
            <div className="space-y-1">
              <Label>
                {translate('conversations.portableBranch.contextMode', 'Portable context')}
              </Label>
              <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="history" disabled={historyBlocked}>
                    {translate(
                      'conversations.portableBranch.history',
                      'Portable copy through this response (not a native fork)'
                    )}
                  </SelectItem>
                  <SelectItem value="targeted">
                    {translate('conversations.portableBranch.targeted', 'Targeted portable copy')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="portable-branch-content">
                {translate(
                  'conversations.portableBranch.content',
                  'Exact editable portable context'
                )}
              </Label>
              <Textarea
                id="portable-branch-content"
                className="min-h-64 font-mono text-xs"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={translate(
                  'conversations.portableBranch.loading',
                  'Loading verified source context…'
                )}
              />
              <p className="text-xs text-muted-foreground">
                {mode === 'history'
                  ? translate(
                      'conversations.portableBranch.historyNote',
                      'This is a portable transcript copy, not a resumed or forked provider session.'
                    )
                  : translate(
                      'conversations.portableBranch.targetedNote',
                      'The selected response is rechecked before preparation; edit this handoff as needed.'
                    )}
              </p>
            </div>
          </fieldset>
        )}
        {historyBlocked ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate(
              'conversations.portableBranch.historyTruncated',
              'The full portable history is bounded, so it cannot be prepared as preserved history. Review the targeted copy instead.'
            )}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {!creatingWorktree ? (
          <DialogFooter>
            <Button variant="ghost" disabled={cannotDismiss} onClick={onClose}>
              {translate('conversations.portableBranch.close', 'Close')}
            </Button>
            {!created ? (
              <Button
                disabled={busy || !preview || !title.trim() || !content.trim()}
                onClick={() => void submit()}
              >
                {busy
                  ? translate('conversations.portableBranch.preparing', 'Preparing…')
                  : intent.current
                    ? translate('conversations.portableBranch.checkAttempt', 'Check preparation')
                    : translate('conversations.portableBranch.prepare', 'Prepare conversation')}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
