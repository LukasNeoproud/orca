import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, Ellipsis, FileCode2, Globe, Maximize2, Minimize2, Pin, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { NativeChatLinkPreviewCard } from '@/components/native-chat/link-preview/NativeChatLinkPreviewCard'
import { useClipboardTextCopyFeedback } from '@/hooks/use-clipboard-text-copy-feedback'
import { BROWSER_TERMINAL_LINK_ACTIONS_SETTINGS_TARGET_ID } from '@/lib/settings-navigation-types'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { LinkActionRow } from './LinkActionRow'
import type { LinkAction, LinkActionRequest } from './link-action-request'

function PreviewIconButton({
  label,
  children,
  onClick,
  pressed
}: {
  label: string
  children: ReactNode
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            'shrink-0 text-muted-foreground',
            pressed && 'bg-accent text-accent-foreground'
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function LinkPreviewPopover<TRequest extends LinkActionRequest>({
  request,
  onClose,
  onPointerEnter,
  onPointerLeave,
  onPin
}: {
  request: TRequest
  onClose: (dismissed?: TRequest) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onPin?: (pinned: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [locallyPinned, setLocallyPinned] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const copyInFlight = useRef(false)
  const { copyText, status } = useClipboardTextCopyFeedback(request.destination)
  const pinned = !request.transient || (!onPin && locallyPinned)
  const preview = request.preview!
  const target = preview.target
  const pin = (value: boolean): void => {
    if (onPin) {
      onPin(value)
    } else {
      setLocallyPinned(value)
    }
  }
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          (request.transient ? request.anchorElement?.getBoundingClientRect() : undefined) ??
          new DOMRect(request.anchorX, request.anchorY, 0, 0)
      }
    }),
    [request.anchorElement, request.anchorX, request.anchorY, request.transient]
  )
  useEffect(() => {
    if (request.focusOnOpen) {
      contentRef.current
        ?.querySelector<HTMLButtonElement>('[data-link-primary] button')
        ?.focus({ preventScroll: true })
    }
  }, [request])
  const close = (restore = false): void => {
    onClose(request)
    if (restore) {
      request.restoreFocus()
    }
  }
  const run = (action: LinkAction): void => {
    close(true)
    void action.run()
  }
  const copy = async (): Promise<void> => {
    if (copyInFlight.current) {
      return
    }
    copyInFlight.current = true
    try {
      if (!(await copyText())) {
        toast.error(
          translate(
            'auto.components.terminal.pane.TerminalLinkActionPopover.copyLinkFailed',
            'Failed to copy link'
          )
        )
      }
    } finally {
      copyInFlight.current = false
    }
  }
  let title = target.path.split(/[/\\]/).pop() ?? target.path
  if (target.kind === 'web') {
    try {
      title = new URL(target.path).hostname
    } catch {
      title = target.path
    }
  }
  const copyLabel =
    status === 'copied'
      ? translate('auto.components.terminal.pane.TerminalLinkActionPopover.copied', 'Copied')
      : target.kind === 'file'
        ? translate('auto.components.nativeChat.preview.copyPath', 'Copy path')
        : translate('auto.components.terminal.pane.TerminalLinkActionPopover.copyLink', 'Copy link')
  const settingsLabel = translate(
    'auto.components.terminal.pane.TerminalLinkActionPopover.terminalLinkSettings',
    'Terminal link settings'
  )
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        ref={contentRef}
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        aria-label={title}
        className={cn(
          'popover-wheel-scroll flex max-h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-visible border-border bg-popover p-0 text-popover-foreground shadow-floating dark:border-border dark:bg-popover dark:shadow-floating',
          expanded && 'w-[min(48rem,calc(100vw-2rem))]'
        )}
        data-link-action-popover
        data-terminal-link-action-popover
        data-link-preview-popover
        data-pinned={pinned}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (request.focusOnOpen) {
            contentRef.current
              ?.querySelector<HTMLButtonElement>('[data-link-primary] button')
              ?.focus({ preventScroll: true })
          }
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          close(!request.transient || contentRef.current?.contains(document.activeElement))
        }}
        onFocusOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (request.anchorElement?.contains(event.target as Node)) {
            event.preventDefault()
          }
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={() => {
          if (!pinned && !menuOpen && !contentRef.current?.contains(document.activeElement)) {
            onPointerLeave?.()
          }
        }}
        onFocusCapture={onPointerEnter}
        onBlurCapture={(event) => {
          if (!pinned && !menuOpen && !event.currentTarget.contains(event.relatedTarget)) {
            onPointerLeave?.()
          }
        }}
      >
        <div className="absolute inset-x-0 -top-2 h-2" aria-hidden="true" />
        <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
          {target.kind === 'file' ? (
            <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Globe className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {title}
              {target.line ? `:${target.line}` : ''}
            </div>
            <div
              className="line-clamp-2 break-all font-mono text-xs text-muted-foreground"
              title={request.destination}
              data-terminal-link-destination
            >
              {request.destination}
            </div>
          </div>
          <PreviewIconButton label={copyLabel} onClick={() => void copy()}>
            {status === 'copied' ? <Check /> : <Copy />}
          </PreviewIconButton>
          {onPin && (
            <PreviewIconButton
              label={
                pinned
                  ? translate('auto.components.linkPreview.unpin', 'Unpin preview')
                  : translate('auto.components.linkPreview.pin', 'Pin preview')
              }
              pressed={pinned}
              onClick={() => pin(!pinned)}
            >
              <Pin />
            </PreviewIconButton>
          )}
          <PreviewIconButton
            label={translate('auto.components.linkPreview.close', 'Close preview')}
            onClick={() => close(true)}
          >
            <X />
          </PreviewIconButton>
        </div>
        <div className="flex min-h-0 overflow-hidden">
          <NativeChatLinkPreviewCard
            target={target}
            runtimeContext={preview.runtimeContext}
            embedded
            expanded={expanded}
          />
        </div>
        <div className="shrink-0 border-t border-border p-1" data-link-primary>
          <LinkActionRow
            action={request.primary}
            shortcut="primary"
            onRun={() => run(request.primary)}
          />
          {request.alternate && (
            <LinkActionRow
              action={request.alternate}
              shortcut="alternate"
              onRun={() => run(request.alternate!)}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-1">
          {target.kind === 'file' ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                pin(true)
                setExpanded(!expanded)
              }}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
              {expanded
                ? translate('auto.components.linkPreview.collapse', 'Reduce preview')
                : translate('auto.components.linkPreview.expand', 'Expand preview')}
            </Button>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {pinned
              ? translate('auto.components.linkPreview.pinned', 'Pinned')
              : translate('auto.components.nativeChat.preview.preview', 'Preview')}
          </span>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open)
              if (open) {
                pin(true)
              }
            }}
            modal={false}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate('auto.components.linkPreview.more', 'More actions')}
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {request.secondaryActions?.map((action) => (
                <DropdownMenuItem key={action.label} onSelect={() => run(action)}>
                  {action.label}
                </DropdownMenuItem>
              ))}
              {!!request.secondaryActions?.length && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => {
                  close()
                  const state = useAppStore.getState()
                  state.openSettingsTarget({
                    pane: 'browser',
                    repoId: null,
                    sectionId: BROWSER_TERMINAL_LINK_ACTIONS_SETTINGS_TARGET_ID
                  })
                  state.openSettingsPage()
                }}
              >
                {settingsLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverContent>
    </Popover>
  )
}
