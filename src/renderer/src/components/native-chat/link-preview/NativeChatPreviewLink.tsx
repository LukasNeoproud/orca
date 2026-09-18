import { routeNativeChatHref } from '../../../../../shared/native-chat-href-routing'
import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'
import { NativeChatLinkPreviewCard } from './NativeChatLinkPreviewCard'

export function NativeChatPreviewLink({
  href,
  children,
  hover,
  runtimeContext,
  onLinkClick
}: {
  href?: string
  children?: ReactNode
  hover: boolean
  runtimeContext?: RuntimeFileOperationArgs | null
  onLinkClick?: CommentMarkdownLinkClickHandler
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const target = href ? resolveChatPreviewTarget(href, runtimeContext) : null
  const link = (
    <a
      href={href || undefined}
      target="_blank"
      rel="noreferrer"
      className="text-foreground/80 underline underline-offset-2 hover:text-foreground"
      onClick={(event) => {
        setOpen(false)
        onLinkClick?.(
          event,
          href,
          target
            ? {
                preview: () => {
                  setOpen(false)
                  setExpanded(true)
                }
              }
            : undefined
        )
        if (routeNativeChatHref(href).kind === 'file') {
          event.preventDefault()
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          onLinkClick?.(event, href)
          if (routeNativeChatHref(href).kind === 'file') {
            event.preventDefault()
          }
        }
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
        }
      }}
    >
      {children}
    </a>
  )
  if (!target) {
    return link
  }
  const preview = (
    <NativeChatLinkPreviewCard
      target={target}
      runtimeContext={runtimeContext}
      onLinkClick={onLinkClick}
    />
  )
  return (
    <>
      {!hover ? (
        link
      ) : (
        <HoverCard open={open && !expanded} onOpenChange={setOpen} openDelay={250} closeDelay={150}>
          <HoverCardTrigger asChild>{link}</HoverCardTrigger>
          <HoverCardContent
            align="start"
            className="w-[min(32rem,calc(100vw-2rem))] p-0"
            onEscapeKeyDown={() => setOpen(false)}
          >
            {preview}
          </HoverCardContent>
        </HoverCard>
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent>
          <DialogTitle className="truncate">{target.path}</DialogTitle>
          {preview}
        </DialogContent>
      </Dialog>
    </>
  )
}
