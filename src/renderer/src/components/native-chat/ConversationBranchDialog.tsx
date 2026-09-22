import { conversationBranchError } from '@/lib/conversation-branch-error'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ConversationBranchTargetFields } from './ConversationBranchTargetFields'
import { TaskWorktreeComposer } from '@/components/new-workspace/TaskWorktreeComposer'
import { getBacklogTaskWorkspaceOptions } from '@/lib/backlog-task-handoff-options'
import {
  previewConversationBranch,
  prepareConversationBranch
} from '@/lib/structured-conversation-branch-client'
import {
  createStructuredAgentSessionId,
  structuredAgentSessionCreateParams
} from '../../../../shared/structured-agent-session-create'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import type {
  AgentSessionBranchPrepareParams,
  AgentSessionBranchPreviewResult,
  AgentSessionBranchRecord,
  AgentSessionBranchRelationKind
} from '../../../../shared/agent-session-branch'
import { translate } from '@/i18n/i18n'
import {
  targetedConversationHandoff,
  type ConversationBranchSelection
} from './conversation-branch-draft'

export function ConversationBranchDialog({
  selection,
  onClose,
  onPrepared
}: {
  selection: ConversationBranchSelection
  onClose: () => void
  onPrepared: (branch: AgentSessionBranchRecord) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(
    selection.selectedText?.trim().split('\n')[0]?.slice(0, 100) ||
      translate('conversations.branch.defaultTitle', 'Related discussion')
  )
  const [workspaceId, setWorkspaceId] = useState(selection.route.workspaceId)
  const [relationKind, setRelationKind] = useState<AgentSessionBranchRelationKind>('discussion')
  const [mode, setMode] = useState<'preserve-history' | 'targeted'>(
    selection.selectedText ? 'targeted' : 'preserve-history'
  )
  const [content, setContent] = useState(() => targetedConversationHandoff(selection))
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<AgentSessionBranchPreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creatingWorktree, setCreatingWorktree] = useState(false)
  const [created, setCreated] = useState<AgentSessionBranchRecord | null>(null)
  const inFlight = useRef(false)
  const intent = useRef<AgentSessionBranchPrepareParams | null>(null)
  const workspaces = getBacklogTaskWorkspaceOptions(selection.route)
  useEffect(() => {
    let current = true
    void previewConversationBranch(selection.target, {
      sourceSessionId: selection.sourceSessionId,
      expectedEpoch: selection.epoch,
      sourceItemId: selection.itemId
    })
      .then((result) => {
        if (current) {
          setPreview(result)
          if (result.historyPreviewUnavailableReason || !result.nativeProviderForkSupported) {
            setMode('targeted')
          }
        }
      })
      .catch((failure) => {
        if (current) {
          setError(conversationBranchError(failure))
        }
      })
    return () => {
      current = false
    }
  }, [selection])
  const submit = async (): Promise<void> => {
    if (inFlight.current || !preview) {
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      let handoff: AgentSessionBranchPrepareParams['handoff']
      if (mode === 'preserve-history') {
        if (!preview.historyPreviewSha256 || !preview.nativeProviderForkSupported) {
          throw new Error('agent_session_branch_provider_unsupported')
        }
        handoff = { mode, instruction, historyPreviewSha256: preview.historyPreviewSha256 }
      } else {
        handoff = { mode, content, sourceItemIds: [selection.itemId] }
      }
      intent.current ??= {
        branchId: crypto.randomUUID(),
        title: title.trim(),
        sourceSessionId: selection.sourceSessionId,
        expectedEpoch: selection.epoch,
        sourceItemId: selection.itemId,
        relationKind,
        target: {
          create: structuredAgentSessionCreateParams({
            sessionId: createStructuredAgentSessionId(selection.agent, () => crypto.randomUUID()),
            worktree: toRuntimeWorktreeSelector(workspaceId),
            agent: selection.agent,
            randomUuid: () => crypto.randomUUID()
          })
        },
        handoff
      }
      const { branch } = await prepareConversationBranch(selection.target, intent.current)
      setCreated(branch)
      onPrepared(branch)
    } catch (failure) {
      setError(conversationBranchError(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const locked = busy || intent.current !== null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !creatingWorktree) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="flex max-h-[85vh] flex-col sm:max-w-2xl"
        showCloseButton={!busy && !creatingWorktree}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('conversations.branch.title', 'Create related conversation')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversations.branch.filesNotice',
              'Conversation history ends at the selected response. Files stay at their current state; no checkout or reset is performed.'
            )}
          </DialogDescription>
        </DialogHeader>
        {creatingWorktree ? (
          <TaskWorktreeComposer
            sourceRoute={selection.route}
            taskTitle={title}
            onCancel={() => setCreatingWorktree(false)}
            onCreated={(id) => {
              setWorkspaceId(id)
              setCreatingWorktree(false)
            }}
          />
        ) : created ? (
          <p role="status" className="text-sm">
            {created.state === 'prepared'
              ? translate(
                  'conversations.branch.prepared',
                  'Conversation prepared. Work starts only when you explicitly start it.'
                )
              : (created.error ??
                translate(
                  'conversations.branch.prepareUnverified',
                  'Preparation is not confirmed. Check the related conversation before retrying.'
                ))}
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
            {!selection.route.workspaceId.startsWith('folder:') ? (
              <Button variant="ghost" size="xs" onClick={() => setCreatingWorktree(true)}>
                {translate('conversations.branch.newWorktree', 'New worktree')}
              </Button>
            ) : null}
            <div className="space-y-1">
              <Label>{translate('conversations.branch.contextMode', 'Context')}</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="preserve-history"
                    disabled={
                      preview?.nativeProviderForkSupported === false ||
                      preview?.historyPreview === null
                    }
                  >
                    {translate(
                      'conversations.branch.preserve',
                      'Preserve history through this response'
                    )}
                  </SelectItem>
                  <SelectItem value="targeted">
                    {translate('conversations.branch.targeted', 'Targeted, editable handoff')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'preserve-history' ? (
              <>
                <details className="rounded-md border border-border p-2 text-xs">
                  <summary>
                    {translate(
                      'conversations.branch.historyPreview',
                      'Historical context (read only)'
                    )}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto scrollbar-sleek whitespace-pre-wrap break-words font-mono text-xs">
                    {preview?.historyPreview ??
                      translate('conversations.branch.loading', 'Loading source history…')}
                  </pre>
                </details>
                <Button
                  size="xs"
                  variant="link"
                  disabled={!preview?.historyPreview}
                  onClick={() => {
                    if (preview?.historyPreview) {
                      setContent(preview.historyPreview)
                      setMode('targeted')
                    }
                  }}
                >
                  {translate(
                    'conversations.branch.editHistory',
                    'Edit a portable copy instead of preserving native history'
                  )}
                </Button>
                <div className="space-y-1">
                  <Label htmlFor="branch-instruction">
                    {translate(
                      'conversations.branch.instruction',
                      'Instruction to send when work is started'
                    )}
                  </Label>
                  <Textarea
                    id="branch-instruction"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    rows={4}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="branch-content">
                  {translate('conversations.branch.exactHandoff', 'Exact handoff content')}
                </Label>
                <Textarea
                  id="branch-content"
                  className="min-h-64 font-mono text-xs"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'conversations.branch.parentNotContext',
                    'The parent link is navigation only. This text is the context you are handing over; project instructions and permissions stay unchanged.'
                  )}
                </p>
              </div>
            )}
          </fieldset>
        )}
        {preview?.historyPreviewUnavailableReason ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate(
              'conversations.branch.historyTooLarge',
              'The full history exceeds the preview limit. Review and edit the targeted handoff.'
            )}
          </p>
        ) : preview && !preview.nativeProviderForkSupported ? (
          <p role="status" className="text-xs text-muted-foreground">
            {translate(
              'conversations.branch.nativeUnavailable',
              'Native history preservation is unavailable for this session. Review the targeted handoff before preparing it.'
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
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              {translate('conversations.branch.close', 'Close')}
            </Button>
            {!created ? (
              <Button
                disabled={
                  busy ||
                  !preview ||
                  !title.trim() ||
                  !(mode === 'targeted' ? content.trim() : instruction.trim()) ||
                  (mode === 'preserve-history' &&
                    (!preview.nativeProviderForkSupported || !preview.historyPreviewSha256))
                }
                onClick={() => void submit()}
              >
                {busy
                  ? translate('conversations.branch.preparing', 'Preparing…')
                  : intent.current
                    ? translate('conversations.branch.checkAttempt', 'Check preparation')
                    : translate('conversations.branch.prepare', 'Prepare conversation')}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
