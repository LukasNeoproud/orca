import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { AgentJournalPlanApprovalSubject } from '../../../../shared/agent-session-journal-types'
import type { ChatApproval, ChatApprovalAnswerExtras } from './native-chat-interactive-prompt'
import { NativeChatApprovalAnswerFields } from './NativeChatApprovalAnswerFields'
import { NativeChatApprovalOptionButtons } from './NativeChatApprovalOptionButtons'
import { NativeChatApprovalPlanBody } from './NativeChatApprovalPlanBody'

/** A proposed plan at reading size, answered from here exactly as from its card. */
export function NativeChatPlanReviewDialog({
  open,
  onOpenChange,
  approval,
  subject,
  extras,
  onExtrasChange,
  onChoose,
  isSubmitting,
  onLinkClick,
  allowFileUriLinks = false
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  approval: ChatApproval
  subject: AgentJournalPlanApprovalSubject
  extras: ChatApprovalAnswerExtras
  onExtrasChange: (extras: ChatApprovalAnswerExtras) => void
  onChoose: (send: string) => void
  isSubmitting: boolean
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-native-chat-plan-review="true"
        // Why: React keys bubble through the portal to the card, whose Escape cancels the turn.
        onKeyDown={(event) => event.stopPropagation()}
        className="flex h-[90vh] max-w-[94vw] flex-col sm:max-w-5xl"
      >
        <DialogTitle>{approval.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {translate(
            'components.native-chat.approval.plan.reviewDescription',
            'The proposed plan in full, with the choices to approve it or keep planning.'
          )}
        </DialogDescription>
        <div
          tabIndex={0}
          className="scrollbar-sleek min-h-0 flex-1 overflow-auto text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <NativeChatApprovalPlanBody
            subject={subject}
            {...(onLinkClick ? { onLinkClick } : {})}
            allowFileUriLinks={allowFileUriLinks}
          />
        </div>
        {approval.accepts ? (
          <NativeChatApprovalAnswerFields
            accepts={approval.accepts}
            extras={extras}
            disabled={isSubmitting}
            onChange={onExtrasChange}
            isPlan
          />
        ) : null}
        <NativeChatApprovalOptionButtons
          options={approval.options}
          disabled={isSubmitting}
          onChoose={onChoose}
        />
      </DialogContent>
    </Dialog>
  )
}
