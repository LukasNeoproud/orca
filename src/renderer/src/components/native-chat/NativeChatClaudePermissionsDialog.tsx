import { useCallback, useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { requestClaudeSessionControl } from '@/runtime/claude-session-control-client'
import {
  CLAUDE_PERMISSION_RULE_FILES,
  isClaudePermissionRuleFile,
  type ClaudePermissionRule,
  type ClaudePermissionRuleBehavior,
  type ClaudePermissionRuleFile,
  type ClaudePermissionRules
} from '../../../../shared/claude-session-control'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { claudeControlErrorText } from './native-chat-claude-control-error-text'

const BEHAVIORS: readonly ClaudePermissionRuleBehavior[] = ['allow', 'ask', 'deny']

function behaviorLabel(behavior: ClaudePermissionRuleBehavior): string {
  switch (behavior) {
    case 'allow':
      return translate('components.native-chat.claudeControls.permissions.allow', 'Allow')
    case 'ask':
      return translate('components.native-chat.claudeControls.permissions.ask', 'Ask')
    case 'deny':
      return translate('components.native-chat.claudeControls.permissions.deny', 'Deny')
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'userSettings':
      return translate('components.native-chat.claudeControls.permissions.user', 'All projects')
    case 'projectSettings':
      return translate(
        'components.native-chat.claudeControls.permissions.project',
        'This project (shared)'
      )
    case 'localSettings':
      return translate(
        'components.native-chat.claudeControls.permissions.local',
        'This project (only you)'
      )
    case 'session':
      return translate('components.native-chat.claudeControls.permissions.session', 'This session')
    case 'policySettings':
      return translate('components.native-chat.claudeControls.permissions.policy', 'Managed policy')
    default:
      return source
  }
}

/** `/permissions`: the rules this chat's Claude applies, by where each comes from. */
export function NativeChatClaudePermissionsDialog({
  target,
  sessionId,
  onClose
}: {
  target: RuntimeClientTarget
  sessionId: string
  onClose: () => void
}): React.JSX.Element {
  const [state, setState] = useState<ClaudePermissionRules | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [behavior, setBehavior] = useState<ClaudePermissionRuleBehavior>('allow')
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<ClaudePermissionRuleFile>('localSettings')
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setState(await requestClaudeSessionControl(target, sessionId, { kind: 'permission-rules' }))
    } catch (failure) {
      setError(claudeControlErrorText(failure))
    }
  }, [sessionId, target])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const edit = async (
    action: 'add' | 'remove',
    rule: string,
    ruleFile: ClaudePermissionRuleFile,
    ruleBehavior: ClaudePermissionRuleBehavior
  ): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      await requestClaudeSessionControl(target, sessionId, {
        kind: 'permission-rule-edit',
        action,
        file: ruleFile,
        behavior: ruleBehavior,
        rule
      })
      if (action === 'add') {
        setDraft('')
      }
      // The CLI reads the file's change on its own watcher; give it a beat before listing again.
      await new Promise((resolve) => setTimeout(resolve, 600))
      await refresh()
    } catch (failure) {
      setError(claudeControlErrorText(failure))
    }
    setPending(false)
  }

  const row = (rule: ClaudePermissionRule): React.JSX.Element => {
    const ruleFile = isClaudePermissionRuleFile(rule.source) ? rule.source : null
    return (
      <li
        key={`${rule.source}:${rule.rule}`}
        className="flex items-center gap-3 py-1.5"
        data-native-chat-permission-rule={rule.rule}
      >
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-xs text-foreground">{rule.rule}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[rule.description, sourceLabel(rule.source)].filter(Boolean).join(' · ')}
          </p>
        </div>
        {ruleFile && rule.editability === 'persistent' ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pending}
            aria-label={translate(
              'components.native-chat.claudeControls.permissions.remove',
              'Remove rule'
            )}
            onClick={() => void edit('remove', rule.rule, ruleFile, rule.behavior)}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </li>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('components.native-chat.claudeControls.permissions.title', 'Permissions')}
          </DialogTitle>
          <DialogDescription>
            {state?.managedOnly
              ? translate(
                  'components.native-chat.claudeControls.permissions.managedOnly',
                  'Your organization allows managed rules only; other rules are ignored.'
                )
              : translate(
                  'components.native-chat.claudeControls.permissions.description',
                  'Rules Claude applies before it asks. A saved rule is written to Claude’s settings file.'
                )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {state === null && !error ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
        {state ? (
          <Tabs
            value={behavior}
            onValueChange={(value) =>
              setBehavior(BEHAVIORS.find((known) => known === value) ?? 'allow')
            }
          >
            <TabsList>
              {BEHAVIORS.map((known) => (
                <TabsTrigger key={known} value={known}>
                  {behaviorLabel(known)} (
                  {state.rules.filter((rule) => rule.behavior === known).length})
                </TabsTrigger>
              ))}
            </TabsList>
            {BEHAVIORS.map((known) => (
              <TabsContent key={known} value={known}>
                <ul className="max-h-[40vh] divide-y divide-border overflow-auto scrollbar-sleek">
                  {state.rules.filter((rule) => rule.behavior === known).map(row)}
                </ul>
              </TabsContent>
            ))}
          </Tabs>
        ) : null}
        {state ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (draft.trim()) {
                void edit('add', draft.trim(), file, behavior)
              }
            }}
          >
            <Input
              value={draft}
              disabled={pending}
              placeholder="Bash(npm run test:*)"
              aria-label={translate(
                'components.native-chat.claudeControls.permissions.newRule',
                'New rule'
              )}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Select
              value={file}
              onValueChange={(value) => isClaudePermissionRuleFile(value) && setFile(value)}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_PERMISSION_RULE_FILES.map((known) => (
                  <SelectItem key={known} value={known}>
                    {sourceLabel(known)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={pending || !draft.trim()}>
              {translate(
                'components.native-chat.claudeControls.permissions.add',
                'Add to {{value0}}',
                {
                  value0: behaviorLabel(behavior)
                }
              )}
            </Button>
          </form>
        ) : null}
        {state && state.workspaceDirectories.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {translate(
                'components.native-chat.claudeControls.permissions.directories',
                'Additional directories'
              )}
            </p>
            {state.workspaceDirectories.map((directory) => (
              <p key={directory.path} className="break-all font-mono">
                {directory.path}
              </p>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
