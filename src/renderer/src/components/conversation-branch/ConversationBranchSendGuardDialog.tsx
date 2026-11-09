import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'

/** Asked before a branch sends while a relative still works in the same files. */
export function ConversationBranchSendGuardDialog({
  relatives,
  onSendNow,
  onSendWhenDone,
  onCancel
}: {
  relatives: readonly string[]
  onSendNow: () => void
  onSendWhenDone: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('conversationBranch.guardTitle', 'Another branch is working')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'conversationBranch.guardDescription',
              '{{value0}} is still working in this workspace. Sending now lets both change the same files, and their changes mix.',
              { value0: relatives.join(', ') }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {translate('conversationBranch.cancel', 'Cancel')}
          </Button>
          <Button variant="outline" onClick={onSendNow}>
            {translate('conversationBranch.guardSendNow', 'Send anyway')}
          </Button>
          <Button onClick={onSendWhenDone}>
            {translate('conversationBranch.guardSendWhenDone', 'Send when it finishes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
