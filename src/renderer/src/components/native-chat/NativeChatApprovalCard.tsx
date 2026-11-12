import { useRef, useState } from 'react'
import { Maximize2, ShieldQuestion, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { approvalBlockedPathToShow } from '../../../../shared/agent-session-approval-blocked-path'
import {
  isNewerApprovalSubject,
  isPlanApprovalSubject
} from '../../../../shared/agent-session-approval-subject'
import { NativeChatApprovalOptionButtons } from './NativeChatApprovalOptionButtons'
import { NativeChatApprovalPlanBody } from './NativeChatApprovalPlanBody'
import { NativeChatPlanReviewDialog } from './NativeChatPlanReviewDialog'
import type { ChatApproval, ChatApprovalAnswerExtras } from './native-chat-interactive-prompt'
import { NativeChatApprovalAnswerFields } from './NativeChatApprovalAnswerFields'
import { NativeChatPromptCollapseToggle } from './NativeChatPromptCollapse'
import { useNativeChatPromptCardFocus } from './use-native-chat-prompt-card-focus'

export type NativeChatApprovalCardProps = {
  approval: ChatApproval
  /** Deliver the option's transport-specific response token. */
  onChoose: (option: string, extras?: ChatApprovalAnswerExtras) => void
  /** Cancel the active provider turn while this card owns the composer region. */
  onCancel?: () => void
  /** Without `onCancel`: fold the card to a strip and give the input back, writing nothing. */
  onCollapse?: () => void
  /** A choice is being delivered: the options wait for its answer. */
  isSubmitting?: boolean
  shouldFocus?: boolean
  /** A plan body renders as markdown; these make its file paths clickable. */
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}

/**
 * Native renderer for an agent tool-approval (PermissionRequest) as an
 * Allow/Deny card. PTY callers supply literal replies while structured callers
 * supply journal option IDs. The first option gets the primary styling.
 */
export function NativeChatApprovalCard({
  approval,
  onChoose,
  onCancel,
  onCollapse,
  isSubmitting = false,
  shouldFocus = false,
  onLinkClick,
  allowFileUriLinks = false
}: NativeChatApprovalCardProps): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [extras, setExtras] = useState<ChatApprovalAnswerExtras>({})
  const inputField = approval.accepts?.inputField
  const neededPath = approvalBlockedPathToShow(approval)
  // A newer Orca's subject: its detail is shown, and only the card's cancel answers.
  const newerSubject = isNewerApprovalSubject(approval.subject)
  const hasContext = Boolean(
    approval.description ||
    approval.decisionReason ||
    neededPath ||
    approval.subject ||
    approval.detail
  )
  const planSubject = isPlanApprovalSubject(approval.subject) ? approval.subject : null
  const [planOpen, setPlanOpen] = useState(false)
  const choose = (send: string): void => {
    setPlanOpen(false)
    if (approval.accepts) {
      onChoose(send, extras)
    } else {
      onChoose(send)
    }
  }
  useNativeChatPromptCardFocus(cardRef, shouldFocus)
  const openPlanLabel = translate(
    'components.native-chat.approval.plan.openFull',
    'Open the plan full screen'
  )
  const escape = onCancel ?? (isSubmitting ? undefined : onCollapse)

  return (
    <div className="min-h-0 shrink overflow-hidden bg-chat-canvas">
      <div className="mx-auto flex h-full min-h-0 max-h-full w-full max-w-(--chat-content-max-width) px-3 pt-2 pb-1 sm:px-4">
        <div
          ref={cardRef}
          data-native-chat-prompt-card-focus={shouldFocus || undefined}
          data-native-chat-approval-card="true"
          role="group"
          aria-label={approval.title}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing && escape) {
              event.preventDefault()
              event.stopPropagation()
              escape()
            }
          }}
          className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-input bg-card px-4 py-3 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex shrink-0 items-start gap-2">
            <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words text-sm font-semibold text-foreground">
                {approval.title}
              </p>
            </div>
            {planSubject ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    data-native-chat-approval-plan-expand="true"
                    aria-label={openPlanLabel}
                    onClick={() => setPlanOpen(true)}
                  >
                    <Maximize2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={4}>
                  {openPlanLabel}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                aria-label={translate('components.native-chat.approval.cancel', 'Cancel')}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            ) : onCollapse ? (
              <NativeChatPromptCollapseToggle
                expanded
                disabled={isSubmitting}
                onToggle={onCollapse}
              />
            ) : null}
          </div>
          {hasContext ? (
            <div
              data-native-chat-approval-content="true"
              tabIndex={0}
              className="min-h-0 max-h-72 shrink space-y-2 overflow-auto text-sm text-muted-foreground scrollbar-sleek focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {approval.description ? (
                <p className="whitespace-pre-wrap break-words">{approval.description}</p>
              ) : null}
              {approval.decisionReason ? (
                <p className="whitespace-pre-wrap break-words">
                  <span className="font-medium text-foreground">
                    {translate('components.native-chat.approval.reason', 'Reason')}:{' '}
                  </span>
                  {approval.decisionReason}
                </p>
              ) : null}
              {neededPath ? (
                <p className="break-words">
                  <span className="font-medium text-foreground">
                    {translate('components.native-chat.approval.needsAccess', 'Needs access to')}
                    :{' '}
                  </span>
                  <span className="font-mono">{neededPath}</span>
                </p>
              ) : null}
              {planSubject ? (
                <NativeChatApprovalPlanBody
                  subject={planSubject}
                  {...(onLinkClick ? { onLinkClick } : {})}
                  allowFileUriLinks={allowFileUriLinks}
                />
              ) : approval.detail && !inputField ? (
                <div
                  data-native-chat-approval-detail="true"
                  data-native-chat-code-content
                  className="whitespace-pre-wrap break-words font-mono text-chat-code"
                >
                  {approval.detail}
                </div>
              ) : null}
              {newerSubject ? (
                <p data-native-chat-approval-needs-newer-orca="true" className="break-words">
                  {translate(
                    'components.native-chat.approval.needsNewerOrca',
                    'This request needs a newer version of Orca.'
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {approval.accepts && !newerSubject ? (
            <NativeChatApprovalAnswerFields
              accepts={approval.accepts}
              extras={extras}
              disabled={isSubmitting}
              onChange={setExtras}
              isPlan={planSubject !== null}
            />
          ) : null}
          <NativeChatApprovalOptionButtons
            options={approval.options}
            disabled={newerSubject || isSubmitting}
            onChoose={choose}
          />
        </div>
        {planSubject ? (
          <NativeChatPlanReviewDialog
            open={planOpen}
            onOpenChange={setPlanOpen}
            approval={approval}
            subject={planSubject}
            extras={extras}
            onExtrasChange={setExtras}
            onChoose={choose}
            isSubmitting={isSubmitting}
            {...(onLinkClick ? { onLinkClick } : {})}
            allowFileUriLinks={allowFileUriLinks}
          />
        ) : null}
      </div>
    </div>
  )
}
