import { translate } from '@/i18n/i18n'
import { nativeChatFilePreviewActions } from './native-chat-file-preview-actions'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
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
  const activePreviewRef = useRef<{ owner: symbol; close: () => void; pinned: boolean } | null>(
    null
  )
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
  const closeActivePreview = useCallback(() => {
    const active = activePreviewRef.current
    activePreviewRef.current = null
    active?.close()
  }, [])
  const claimPreviewOwner = useCallback((owner: symbol, close: () => void, pinned: boolean) => {
    const active = activePreviewRef.current
    if (active?.owner === owner) {
      activePreviewRef.current = { owner, close, pinned }
      return true
    }
    if (active?.pinned && !pinned) {
      return false
    }
    active?.close()
    activePreviewRef.current = { owner, close, pinned }
    return true
  }, [])
  const claimPreview = useCallback(
    (owner: symbol, close: () => void, pinned: boolean) => {
      if (
        !scope.isVisible ||
        !previewScopeRef.current.isVisible ||
        previewScopeRef.current.scopeKey !== scopeKey
      ) {
        return false
      }
      return claimPreviewOwner(owner, close, pinned)
    },
    [claimPreviewOwner, scope.isVisible, scopeKey]
  )
  const releasePreview = useCallback((owner: symbol) => {
    if (activePreviewRef.current?.owner === owner) {
      activePreviewRef.current = null
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const closeOnScroll = (): void => {
      closeActivePreview()
      setLinkActionRequest(null)
    }
    root.addEventListener('scroll', closeOnScroll, true)
    return () => root.removeEventListener('scroll', closeOnScroll, true)
  }, [closeActivePreview, rootRef])
  useEffect(() => {
    closeActivePreview()
  }, [closeActivePreview, scopeKey, scope.isVisible])

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
        request.additionalActions = [
          {
            label: translate(
              'auto.components.nativeChat.preview.addReference',
              'Add reference to prompt'
            ),
            run: () => insertReference(`${route.url} `)
          },
          ...(request.additionalActions ?? [])
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
        const request = createPreviewRequest(event.currentTarget, href ?? '')
        if (request) {
          if (event.detail !== 0) {
            request.anchorX = event.clientX
            request.anchorY = event.clientY
          }
          request.preview = options?.preview
          if (!options?.preview) {
            request.additionalActions = [
              ...(request.additionalActions ?? []),
              {
                label: translate('auto.components.nativeChat.preview.copyPath', 'Copy path'),
                run: () => window.api.ui.writeClipboardText(request.destination)
              }
            ]
          }
          event.preventDefault()
          event.stopPropagation()
          closeActivePreview()
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
        request: (request) => {
          closeActivePreview()
          setLinkActionRequest({
            ...request,
            preview: options?.preview,
            additionalActions: [
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
        }
      })
    },
    [closeActivePreview, context, createPreviewRequest, openFileLink, rootRef, insertReference]
  )

  onLinkClick.createPreviewRequest = createPreviewRequest
  onLinkClick.claimPreview = claimPreview
  onLinkClick.releasePreview = releasePreview

  return {
    onLinkClick: context ? onLinkClick : undefined,
    linkActionRequest,
    closeLinkActions
  }
}
