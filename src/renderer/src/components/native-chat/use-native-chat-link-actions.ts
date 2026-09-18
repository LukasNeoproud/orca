import { translate } from '@/i18n/i18n'
import { nativeChatFilePreviewActions } from './native-chat-file-preview-actions'
import { useCallback, useState, type RefObject } from 'react'
import {
  closeLinkActionRequest,
  type LinkActionRequest
} from '@/components/link-actions/link-action-request'
import { httpLinkActionDestinationsFor } from '@/lib/http-link-destinations'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { routeNativeChatHref } from '../../../../shared/native-chat-href-routing'
import { useAppStore } from '../../store'
import type { NativeChatFileLinkContext } from './native-chat-file-link'
import {
  canNativeChatOpenOwnedBrowser,
  resolveNativeChatHttpLinkSourceOwner
} from './native-chat-http-link-source-owner'
import { handleNativeChatWebLink } from './native-chat-web-link-actions'
import { useNativeChatFileLinkClick } from './use-native-chat-file-link-click'

export type NativeChatLinkActions = {
  onLinkClick: CommentMarkdownLinkClickHandler | undefined
  linkActionRequest: LinkActionRequest | null
  closeLinkActions: (dismissed?: LinkActionRequest) => void
}

/** Transcript links: file targets open in Orca, http(s) targets offer the same
 *  destination popover the terminal shows. */
export function useNativeChatLinkActions(
  context: NativeChatFileLinkContext | null,
  rootRef: RefObject<HTMLElement | null>,
  scope: { sessionId: string | null; isVisible: boolean; insertReference?: (text: string) => void }
): NativeChatLinkActions {
  const { insertReference } = scope
  const openFileLink = useNativeChatFileLinkClick(context)
  const [linkActionRequest, setLinkActionRequest] = useState<LinkActionRequest | null>(null)
  const scopeKey = JSON.stringify([
    context?.worktreeId,
    context?.runtimeEnvironmentId,
    scope.sessionId
  ])
  const [previousScopeKey, setPreviousScopeKey] = useState(scopeKey)
  if (previousScopeKey !== scopeKey || (!scope.isVisible && linkActionRequest !== null)) {
    setPreviousScopeKey(scopeKey)
    setLinkActionRequest(null)
  }
  const closeLinkActions = useCallback((dismissed?: LinkActionRequest) => {
    setLinkActionRequest((current) => closeLinkActionRequest(current, dismissed))
  }, [])

  const onLinkClick = useCallback<CommentMarkdownLinkClickHandler>(
    (event, href, options) => {
      if (!context) {
        return
      }
      const route = routeNativeChatHref(href)
      if (route.kind === 'file') {
        if (
          event.shiftKey ||
          (navigator.userAgent.includes('Mac') ? event.metaKey : event.ctrlKey) ||
          event.button === 1
        ) {
          openFileLink?.(event, href)
          return
        }
        const request = nativeChatFilePreviewActions(
          event,
          href,
          context,
          openFileLink,
          insertReference
        )
        if (request) {
          if (options?.preview) {
            request.additionalActions = [
              {
                label: translate('auto.components.nativeChat.preview.preview', 'Preview'),
                run: options.preview
              },
              ...(request.additionalActions ?? [])
            ]
          }
          event.preventDefault()
          event.stopPropagation()
          setLinkActionRequest(request)
        }
        return
      }
      // mailto: and other schemes keep the anchor's default handling.
      if (route.kind !== 'web' || !/^https?:/i.test(route.url)) {
        return
      }
      // Read at click time: settings and workspace ownership must not re-render the transcript.
      const state = useAppStore.getState()
      const sourceOwner = resolveNativeChatHttpLinkSourceOwner(state, context.worktreeId)
      const anchor = event.currentTarget
      handleNativeChatWebLink(event, route.url, {
        worktreeId: context.worktreeId,
        sourceOwner,
        destinations: httpLinkActionDestinationsFor(
          state.settings,
          sourceOwner,
          canNativeChatOpenOwnedBrowser(state, context.worktreeId, sourceOwner)
        ),
        actionsEnabled: state.settings?.terminalLinkActionPopoverEnabled !== false,
        restoreFocus: () =>
          (anchor.isConnected ? anchor : rootRef.current)?.focus({ preventScroll: true }),
        request: (request) =>
          setLinkActionRequest({
            ...request,
            additionalActions: [
              ...(options?.preview
                ? [
                    {
                      label: translate('auto.components.nativeChat.preview.preview', 'Preview'),
                      run: options.preview
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
                      run: () => insertReference?.(`${route.url} `)
                    }
                  ]
                : []),
              ...(request.additionalActions ?? [])
            ]
          })
      })
    },
    [context, openFileLink, rootRef, insertReference]
  )

  return {
    onLinkClick: context ? onLinkClick : undefined,
    linkActionRequest,
    closeLinkActions
  }
}
