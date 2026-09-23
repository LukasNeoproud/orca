import { Text, View } from 'react-native'
import { ActionSheetContent } from '../components/ActionSheetModal'
import { BottomDrawer } from '../components/BottomDrawer'
import { MobileContextualFilePreviewCard } from '../files/MobileContextualFilePreviewCard'
import { contextualPreviewStyles as styles } from '../files/mobile-contextual-preview-styles'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { getMobileLinkActionSheetActions } from './mobile-link-action-sheet-actions'
import {
  mobileLinkActionDestination,
  mobileLinkActionTitle,
  contextualFileTargetForMobileLink,
  type MobileLinkActionTarget
} from './mobile-link-action-target'
import type { MobileTerminalLinkOpenMode } from '../storage/preferences'

export function MobileLinkActionSheet(props: {
  target: MobileLinkActionTarget | null
  client: Pick<RpcClient, 'sendRequest'> | null
  connectionState: ConnectionState
  worktreeId: string
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
  showAddToMessage?: boolean
}): React.JSX.Element {
  const { target } = props
  const actions = target
    ? getMobileLinkActionSheetActions({
        target,
        preferredWebMode: props.preferredWebMode,
        canOpenOrcaBrowser:
          props.canOpenOrcaBrowser && target.kind === 'web' && /^https?:\/\//i.test(target.url),
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
        onAddToMessage: () => props.onAddToMessage(target),
        showAddToMessage: props.showAddToMessage
      })
    : []
  return (
    <BottomDrawer visible={target != null} onClose={props.onClose} dragContentToDismiss>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle} numberOfLines={1}>
          {target ? mobileLinkActionTitle(target) : 'Link'}
        </Text>
        {target ? (
          <Text style={styles.sheetPath} numberOfLines={2}>
            {mobileLinkActionDestination(target)}
          </Text>
        ) : null}
      </View>
      {target?.kind === 'file' ? (
        <MobileContextualFilePreviewCard
          client={props.client}
          connectionState={props.connectionState}
          worktreeId={props.worktreeId}
          target={contextualFileTargetForMobileLink(target)}
        />
      ) : null}
      {target?.kind === 'web' ? (
        <View style={styles.webPreview} accessibilityLabel="Web link preview">
          <Text style={styles.webPreviewUrl}>{target.url}</Text>
          <Text style={styles.webPreviewHint}>Open the link to view the website.</Text>
        </View>
      ) : null}
      <ActionSheetContent actions={actions} onClose={props.onClose} />
    </BottomDrawer>
  )
}
