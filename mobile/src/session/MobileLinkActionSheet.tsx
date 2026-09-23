import { ActionSheetModal } from '../components/ActionSheetModal'
import { getMobileLinkActionSheetActions } from './mobile-link-action-sheet-actions'
import {
  mobileLinkActionDestination,
  mobileLinkActionTitle,
  type MobileLinkActionTarget
} from './mobile-link-action-target'
import type { MobileTerminalLinkOpenMode } from '../storage/preferences'

export function MobileLinkActionSheet(props: {
  target: MobileLinkActionTarget | null
  preferredWebMode: MobileTerminalLinkOpenMode
  canOpenOrcaBrowser: boolean
  onClose: () => void
  onOpenFile: (target: Extract<MobileLinkActionTarget, { kind: 'file' }>) => void
  onPreviewFile: (target: Extract<MobileLinkActionTarget, { kind: 'file' }>) => void
  onOpenWeb: (
    target: Extract<MobileLinkActionTarget, { kind: 'web' }>,
    mode: MobileTerminalLinkOpenMode
  ) => void
  onCopy: (target: MobileLinkActionTarget) => void
  onAddToMessage: (target: MobileLinkActionTarget) => void
}): React.JSX.Element {
  const { target } = props
  return (
    <ActionSheetModal
      visible={target != null}
      title={target ? mobileLinkActionTitle(target) : 'Link'}
      message={target ? mobileLinkActionDestination(target) : undefined}
      actions={
        target
          ? getMobileLinkActionSheetActions({
              target,
              preferredWebMode: props.preferredWebMode,
              canOpenOrcaBrowser:
                props.canOpenOrcaBrowser &&
                target.kind === 'web' &&
                /^https?:\/\//i.test(target.url),
              onOpenFile: () => {
                if (target.kind === 'file') {
                  props.onOpenFile(target)
                }
              },
              onPreviewFile: () => {
                if (target.kind === 'file') {
                  props.onPreviewFile(target)
                }
              },
              onOpenWeb: (mode) => {
                if (target.kind === 'web') {
                  props.onOpenWeb(target, mode)
                }
              },
              onCopy: () => props.onCopy(target),
              onAddToMessage: () => props.onAddToMessage(target)
            })
          : []
      }
      onClose={props.onClose}
    />
  )
}
