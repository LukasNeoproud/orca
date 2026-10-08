import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { createAzureDevOpsReviewDraft } from '@/lib/azure-devops-review-client'
import type {
  AzureDevOpsLineSide,
  AzureDevOpsReviewDraftKind,
  AzureDevOpsThreadStatus
} from '../../../../shared/azure-devops-review-types'
import { threadStatusLabel } from './azure-devops-review-labels'

const KEEP_STATUS = 'keep'
const REPLY_STATUSES: AzureDevOpsThreadStatus[] = [
  'active',
  'fixed',
  'wontFix',
  'closed',
  'byDesign'
]

function parseLine(value: string): number | null {
  const line = Number(value)
  return Number.isInteger(line) && line > 0 ? line : null
}

/** Inline form that saves a new draft; `kind` decides which location fields it asks for. */
export function AzureDevOpsDraftComposer({
  pullRequestKey,
  kind,
  filePath,
  threadId,
  onDone,
  onCancel
}: {
  pullRequestKey: string
  kind: AzureDevOpsReviewDraftKind
  filePath?: string
  threadId?: number
  onDone: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const [startLine, setStartLine] = useState('')
  const [endLine, setEndLine] = useState('')
  const [side, setSide] = useState<AzureDevOpsLineSide>('right')
  const [threadStatus, setThreadStatus] = useState<string>(KEEP_STATUS)
  const [saving, setSaving] = useState(false)
  const start = parseLine(startLine)
  const end = endLine.trim() ? parseLine(endLine) : start
  const linesValid = kind !== 'inline' || (start !== null && end !== null && end >= start)

  const save = async (): Promise<void> => {
    if (!body.trim() || !linesValid) {
      return
    }
    setSaving(true)
    try {
      await createAzureDevOpsReviewDraft({
        pullRequestKey,
        kind,
        body,
        filePath: filePath ?? null,
        anchor:
          kind === 'inline' && start !== null
            ? { side, startLine: start, endLine: end ?? start }
            : null,
        threadId: threadId ?? null,
        threadStatus:
          kind === 'reply' && threadStatus !== KEEP_STATUS
            ? (threadStatus as AzureDevOpsThreadStatus)
            : null
      })
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      {kind === 'inline' ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {translate('azureDevOpsReview.lines', 'Lines')}
          </span>
          <Input
            aria-label={translate('azureDevOpsReview.startLine', 'Start line')}
            inputMode="numeric"
            value={startLine}
            onChange={(event) => setStartLine(event.target.value)}
            className="h-7 w-20 text-xs"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            aria-label={translate('azureDevOpsReview.endLine', 'End line')}
            inputMode="numeric"
            placeholder={startLine}
            value={endLine}
            onChange={(event) => setEndLine(event.target.value)}
            className="h-7 w-20 text-xs"
          />
          <Select value={side} onValueChange={(value) => setSide(value as AzureDevOpsLineSide)}>
            <SelectTrigger size="sm" className="h-7 w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="right">
                {translate('azureDevOpsReview.sideRight', 'New version')}
              </SelectItem>
              <SelectItem value="left">
                {translate('azureDevOpsReview.sideLeft', 'Old version')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Textarea
        autoFocus
        aria-label={translate('azureDevOpsReview.draftBody', 'Draft comment')}
        placeholder={translate('azureDevOpsReview.draftPlaceholder', 'Write a comment (Markdown)')}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
        className="min-h-20 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        {kind === 'reply' ? (
          <Select value={threadStatus} onValueChange={setThreadStatus}>
            <SelectTrigger
              size="sm"
              aria-label={translate(
                'azureDevOpsReview.setThreadStatus',
                'Thread status after reply'
              )}
              className="h-7 w-auto text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP_STATUS}>
                {translate('azureDevOpsReview.keepStatus', 'Keep thread status')}
              </SelectItem>
              {REPLY_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {threadStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onCancel} disabled={saving}>
          {translate('azureDevOpsReview.cancel', 'Cancel')}
        </Button>
        <Button
          size="xs"
          onClick={() => void save()}
          disabled={saving || !body.trim() || !linesValid}
        >
          {translate('azureDevOpsReview.saveDraft', 'Save draft')}
        </Button>
      </div>
    </div>
  )
}
