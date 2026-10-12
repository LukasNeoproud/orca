import { translate } from '@/i18n/i18n'
import { nativeChatFilePreviewActions } from './native-chat-file-preview-actions'
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
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
import {
  handleNativeChatWebLink,
  nativeChatWebLinkActionRequest
} from './native-chat-web-link-actions'
import { nativeChatPlainLinkClickBehavior } from './native-chat-link-click-behavior'
import { isTerminalLinkActionActivation } from '@/components/terminal-pane/terminal-link-activation'
import { useNativeChatFileLinkClick } from './use-native-chat-file-link-click'

export type NativeChatLinkActions = {
  onLinkClick: CommentMarkdownLinkClickHandler | undefined
  linkActionRequest: LinkActionRequest | null
  closeLinkActions: (dismissed?: LinkActionRequest) => void
}

/** Transcript links offer the same destination popovers the terminal shows: file
 *  targets open in Orca or the default app, http(s) targets in a browser. */
export function useNativeChatLinkActions(
  context: NativeChatFileLinkContext | null,
  rootRef: RefObject<HTMLElement | null>,
  scope: {
    sessionId: string | null
    isVisible: boolean
    composerRef?: RefObject<{ insertTypedText: (text: string) => void } | null>
  }
): NativeChatLinkActions {
  const { composerRef } = scope
  const insertReference = useMemo(
    () => (composerRef ? (text: string) => composerRef.current?.insertTypedText(text) : undefined),
    [composerRef]
  )
  const [linkActionRequest, setLinkActionRequest] = useState<LinkActionRequest | null>(null)
  const openFileLink = useNativeChatFileLinkClick(context, setLinkActionRequest, rootRef)
  const scopeKey = JSON.stringify([
    context?.worktreeId,
    context?.runtimeEnvironmentId,
    scope.sessionId
  ])
  const [previousScopeKey, setPreviousScopeKey] = useState(scopeKey)
  const previewScopeRef = useRef({ scopeKey, isVisible: scope.isVisible })
  previewScopeRef.current = { scopeKey, isVisible: scope.isVisible }
  if (previousScopeKey !== scopeKey || (!scope.isVisible && linkActionRequest !== null)) {
    setPreviousScopeKey(scopeKey)
    setLinkActionRequest(null)
  }
  const closeLinkActions = useCallback((dismissed?: LinkActionRequest) => {
    setLinkActionRequest((current) => closeLinkActionRequest(current, dismissed))
  }, [])
  const showPreview = useCallback(
    (request: LinkActionRequest, explicit: boolean) => {
      if (!previewScopeRef.current.isVisible || previewScopeRef.current.scopeKey !== scopeKey) {
        return
      }
      setLinkActionRequest((current) => {
        if (current && !explicit) {
          return current
        }
        return { ...request, transient: false }
      })
    },
    [scopeKey]
  )

  const createPreviewRequest = useCallback(
    (anchor: HTMLElement, href: string): LinkActionRequest | null => {
      if (!context || !scope.isVisible || previewScopeRef.current.scopeKey !== scopeKey) {
        return null
      }
      const route = routeNativeChatHref(href)
      if (route.kind === 'file') {
        return nativeChatFilePreviewActions(anchor, href, context, insertReference, false)
      }
      if (route.kind !== 'web' || !/^https?:/i.test(route.url)) {
        return null
      }
      const state = useAppStore.getState()
      const sourceOwner = resolveNativeChatHttpLinkSourceOwner(state, context.worktreeId)
      const request = nativeChatWebLinkActionRequest(anchor, route.url, {
        worktreeId: context.worktreeId,
        sourceOwner,
        destinations: httpLinkActionDestinationsFor(
          state.settings,
          sourceOwner,
          canNativeChatOpenOwnedBrowser(state, context.worktreeId, sourceOwner)
        ),
        restoreFocus: () =>
          (anchor.isConnected ? anchor : rootRef.current)?.focus({ preventScroll: true })
      })
      request.pinOnClick = state.settings?.terminalLinkActionPopoverEnabled !== false
      if (insertReference) {
        request.secondaryActions = [
          {
            label: translate(
              'auto.components.nativeChat.preview.addReference',
              'Add reference to prompt'
            ),
            run: () => insertReference(`${route.url} `)
          },
          ...(request.secondaryActions ?? [])
        ]
      }
      return request
    },
    [context, insertReference, rootRef, scope.isVisible, scopeKey]
  )

  const onLinkClick = useCallback<CommentMarkdownLinkClickHandler>(
    (event, href, options) => {
      if (!context) {
        return
      }
      setLinkActionRequest(null)
      const route = routeNativeChatHref(href)
      if (route.kind === 'file') {
        // Only a plain click under the 'actions' setting previews; the rest open as upstream does.
        if (
          !isTerminalLinkActionActivation(event) ||
          !(event.currentTarget instanceof HTMLElement) ||
          nativeChatPlainLinkClickBehavior(useAppStore.getState().settings) !== 'actions'
        ) {
          openFileLink?.(event, href)
          return
        }
        const request = createPreviewRequest(event.currentTarget, href ?? '')
        if (request) {
          if (event.detail !== 0) {
            request.anchorX = event.clientX
            request.anchorY = event.clientY
          }
          request.preview = options?.preview
          if (!options?.preview) {
            request.secondaryActions = [
              ...(request.secondaryActions ?? []),
              {
                label: translate('auto.components.nativeChat.preview.copyPath', 'Copy path'),
                run: () => window.api.ui.writeClipboardText(request.destination)
              }
            ]
          }
          event.preventDefault()
          event.stopPropagation()
          setLinkActionRequest(request)
        } else {
          openFileLink?.(event, href)
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
      const plainClickBehavior = nativeChatPlainLinkClickBehavior(state.settings)
      const anchor = event.currentTarget
      handleNativeChatWebLink(event, route.url, {
        worktreeId: context.worktreeId,
        sourceOwner,
        destinations: httpLinkActionDestinationsFor(
          state.settings,
          sourceOwner,
          canNativeChatOpenOwnedBrowser(state, context.worktreeId, sourceOwner)
        ),
        actionsEnabled: plainClickBehavior === 'actions',
        plainClickBehavior,
        restoreFocus: () =>
          (anchor.isConnected ? anchor : rootRef.current)?.focus({ preventScroll: true }),
        request: (request) => {
          setLinkActionRequest({
            ...request,
            preview: options?.preview,
            secondaryActions: [
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
              ...(request.secondaryActions ?? [])
            ]
          })
        }
      })
    },
    [context, createPreviewRequest, openFileLink, rootRef, insertReference]
  )

  const onLinkClickWithPreview = useMemo(
    () => Object.assign(onLinkClick, { createPreviewRequest, showPreview }),
    [createPreviewRequest, onLinkClick, showPreview]
  )

  return {
    onLinkClick: context ? onLinkClickWithPreview : undefined,
    linkActionRequest,
    closeLinkActions
  }
}
