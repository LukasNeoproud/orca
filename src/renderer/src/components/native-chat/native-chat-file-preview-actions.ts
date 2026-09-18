import { formatNativeChatFileReference } from './native-chat-composer-target'
import { translate } from '@/i18n/i18n'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { LinkActionRequest } from '@/components/link-actions/link-action-request'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { toWorktreeRelativePath } from '@/lib/terminal-links'
import { resolveNativeChatFileLink, type NativeChatFileLinkContext } from './native-chat-file-link'

export function nativeChatFilePreviewActions(
  event: Parameters<CommentMarkdownLinkClickHandler>[0],
  href: string | undefined,
  context: NativeChatFileLinkContext,
  open: CommentMarkdownLinkClickHandler | undefined,
  insertReference?: (text: string) => void
): LinkActionRequest | null {
  const target = resolveNativeChatFileLink(href, context)
  if (!target) {
    return null
  }
  const anchor = event.currentTarget
  const keyboardAnchor = event.detail === 0 ? anchor.getBoundingClientRect() : null
  const state = useAppStore.getState()
  const relative = toWorktreeRelativePath(target.absolutePath, context.worktreePath)
  const changed = state.gitStatusByWorktree?.[context.worktreeId]?.find(
    (entry) => entry.path === relative && !entry.conflictStatus && !entry.submoduleRoot
  )
  return {
    anchorX: keyboardAnchor?.left ?? event.clientX,
    anchorY: keyboardAnchor?.bottom ?? event.clientY,
    destination: target.absolutePath,
    kind: 'file',
    primary: {
      label: translate('auto.components.nativeChat.preview.openFile', 'Open file'),
      run: () => open?.(event, href)
    },
    additionalActions: [
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
      {
        label: translate('auto.components.nativeChat.preview.copyPath', 'Copy path'),
        run: () => window.api.ui.writeClipboardText(target.absolutePath)
      }
    ],
    restoreFocus: () => {
      if (anchor.isConnected) {
        anchor.focus({ preventScroll: true })
      }
    }
  }
}
