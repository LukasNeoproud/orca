import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { WorkspaceCombobox } from '@/components/automations/WorkspaceCombobox'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import type { AgentSessionBranchRelationKind } from '../../../../shared/agent-session-branch'

export function ConversationBranchTargetFields({
  title,
  setTitle,
  relationKind,
  setRelationKind,
  workspaces,
  workspaceId,
  setWorkspaceId
}: {
  title: string
  setTitle: (value: string) => void
  relationKind: AgentSessionBranchRelationKind
  setRelationKind: (value: AgentSessionBranchRelationKind) => void
  workspaces: Worktree[]
  workspaceId: string
  setWorkspaceId: (value: string) => void
}): React.JSX.Element {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="branch-title">{translate('conversations.branch.name', 'Name')}</Label>
        <Input
          id="branch-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={512}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{translate('conversations.branch.relationship', 'Relationship')}</Label>
          <Select
            value={relationKind}
            onValueChange={(value) => setRelationKind(value as AgentSessionBranchRelationKind)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discussion">
                {translate('conversations.branch.discussion', 'Side discussion')}
              </SelectItem>
              <SelectItem value="subtask">
                {translate('conversations.branch.subtask', 'Subtask')}
              </SelectItem>
              <SelectItem value="alternative">
                {translate('conversations.branch.alternative', 'Alternative solution')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{translate('conversations.branch.workspace', 'Workspace')}</Label>
          <WorkspaceCombobox
            worktrees={workspaces}
            value={workspaceId}
            onValueChange={setWorkspaceId}
          />
        </div>
      </div>
    </>
  )
}
