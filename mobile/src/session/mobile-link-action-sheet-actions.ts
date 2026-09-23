import { Copy, ExternalLink, Eye, Globe, MessageSquarePlus } from 'lucide-react-native'
import type { ActionSheetAction } from '../components/ActionSheetModal'
import type { MobileTerminalLinkOpenMode } from '../storage/preferences'
import type { MobileLinkActionTarget } from './mobile-link-action-target'

export function getMobileLinkActionSheetActions(args: {
  target: MobileLinkActionTarget
  preferredWebMode: MobileTerminalLinkOpenMode
  canOpenOrcaBrowser: boolean
  onOpenFile: () => void
  onPreviewFile: () => void
  onOpenWeb: (mode: MobileTerminalLinkOpenMode) => void
  onCopy: () => void
  onAddToMessage: () => void
}): ActionSheetAction[] {
  if (args.target.kind === 'file') {
    return [
      { label: 'Open', icon: ExternalLink, onPress: args.onOpenFile },
      { label: 'Preview', icon: Eye, onPress: args.onPreviewFile },
      { label: 'Copy Path', icon: Copy, onPress: args.onCopy },
      { label: 'Add to Message', icon: MessageSquarePlus, onPress: args.onAddToMessage }
    ]
  }

  const phoneAction: ActionSheetAction = {
    label: 'Open in Phone Browser',
    icon: ExternalLink,
    onPress: () => args.onOpenWeb('phone-browser')
  }
  const orcaAction: ActionSheetAction = {
    label: 'Open in Orca Browser',
    icon: Globe,
    onPress: () => args.onOpenWeb('orca-browser')
  }
  const openActions = args.canOpenOrcaBrowser
    ? args.preferredWebMode === 'phone-browser'
      ? [phoneAction, orcaAction]
      : [orcaAction, phoneAction]
    : [phoneAction]
  return [
    ...openActions,
    { label: 'Copy Link', icon: Copy, onPress: args.onCopy },
    { label: 'Add to Message', icon: MessageSquarePlus, onPress: args.onAddToMessage }
  ]
}
