import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { AgentJournalPlanApprovalSubject } from '../../../../shared/agent-session-journal-types'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatMarkdown } from './NativeChatMarkdown'

/** A proposed plan as its approval shows it, in the card and in the full-size review. */
export function NativeChatApprovalPlanBody({
  subject,
  onLinkClick,
  allowFileUriLinks = false
}: {
  subject: AgentJournalPlanApprovalSubject
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}): React.JSX.Element {
  return (
    <div data-native-chat-approval-plan="true">
      <NativeChatMarkdown
        content={subject.text}
        variant="document"
        className="text-sm text-chat-foreground"
        renderCodeBlock={NativeChatCodeBlock}
        {...(onLinkClick ? { onLinkClick } : {})}
        allowFileUriLinks={allowFileUriLinks}
        linkifyFilePaths={onLinkClick !== undefined}
      />
      {subject.filePath ? (
        <p className="mt-2 break-all">
          <span className="font-medium text-foreground">
            {translate('components.native-chat.approval.plan.file', 'Plan file')}:{' '}
          </span>
          <span className="font-mono">{subject.filePath}</span>
        </p>
      ) : null}
    </div>
  )
}
