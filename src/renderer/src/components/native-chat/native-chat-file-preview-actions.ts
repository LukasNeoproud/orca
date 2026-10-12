import { formatNativeChatFileReference } from './native-chat-composer-target'
import { translate } from '@/i18n/i18n'
import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import { resolveNativeChatFileLink, type NativeChatFileLinkContext } from './native-chat-file-link'
import { buildFileLinkActions } from '@/components/terminal-pane/terminal-file-link-actions'
import { resolveNativeChatHttpLinkSourceOwner } from './native-chat-http-link-source-owner'

export function nativeChatFilePreviewActions(
  anchor: HTMLElement,
  href: string | undefined,
  context: NativeChatFileLinkContext,
  insertReference?: (text: string) => void,
  includeCopyPath = true
): LinkActionRequest | null {
  const target = resolveNativeChatFileLink(href, context)
  if (!target) {
    return null
  }
  const bounds = anchor.getBoundingClientRect()
  const state = useAppStore.getState()
  const openActions = buildFileLinkActions(
    target.absolutePath,
    target.line,
    target.column,
    context,
    resolveNativeChatHttpLinkSourceOwner(state, context.worktreeId)
  )
  const relative = toWorktreeRelativePath(target.absolutePath, context.worktreePath)
  const changed = state.gitStatusByWorktree?.[context.worktreeId]?.find(
    (entry) => entry.path === relative && !entry.conflictStatus && !entry.submoduleRoot
  )
  return {
    anchorX: bounds.left,
    anchorY: bounds.bottom,
    anchorElement: anchor,
    destination: target.absolutePath,
    kind: openActions.kind,
    primary: openActions.primary,
    alternate: openActions.alternate,
    secondaryActions: [
      ...(openActions.secondaryActions ?? []),
      ...(changed
        ? [
            {
              label: translate(
                'auto.components.nativeChat.preview.reviewChanges',
                'Review changes in Source Control'
              ),
              run: () =>
                state.openDiff(
                  context.worktreeId,
                  target.absolutePath,
                  changed.path,
                  detectLanguage(target.absolutePath),
                  changed.area === 'staged'
                )
            }
          ]
        : []),
      ...(insertReference
        ? [
            {
              label: translate(
                'auto.components.nativeChat.preview.addReference',
                'Add reference to prompt'
              ),
              run: () =>
                insertReference(
                  `${formatNativeChatFileReference(`${target.absolutePath}${target.line ? `:${target.line}` : ''}`)} `
                )
            }
          ]
        : []),
      ...(includeCopyPath
        ? [
            {
              label: translate('auto.components.nativeChat.preview.copyPath', 'Copy path'),
              run: () => window.api.ui.writeClipboardText(target.absolutePath)
            }
          ]
        : [])
    ],
    restoreFocus: () => {
      if (anchor.isConnected) {
        anchor.focus({ preventScroll: true })
      }
    }
  }
}
