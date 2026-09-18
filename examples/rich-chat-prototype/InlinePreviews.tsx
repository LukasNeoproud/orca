import { useMemo, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { remarkNativeChatFileLinks } from '@/components/sidebar/comment-markdown-native-chat-file-links'
import { FileLinkMenu } from './FileLinkMenu'
import { PreviewContent } from './PreviewContent'
import { FileCard, type FileActions } from './FileCard'
import { collectPreviewGroups, resolveFixture } from './preview-placement'
import type { PreviewFile } from './fixtures'

function InlineLink({
  file,
  children,
  actions,
  updated
}: {
  file: PreviewFile
  children: ReactNode
  actions: FileActions
  updated: boolean
}) {
  const [preview, setPreview] = useState(false)
  const [menu, setMenu] = useState(false)
  return (
    <HoverCard open={preview && !menu} onOpenChange={setPreview} openDelay={350} closeDelay={150}>
      <DropdownMenu
        open={menu}
        onOpenChange={(open) => {
          setMenu(open)
          if (open) {
            setPreview(false)
          }
        }}
      >
        <HoverCardTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-file-link"
              onFocus={() => setPreview(true)}
              onBlur={(event) => {
                if (
                  !(event.relatedTarget instanceof Element) ||
                  !event.relatedTarget.closest('[data-slot="hover-card-content"]')
                ) {
                  setPreview(false)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setPreview(false)
                }
              }}
            >
              {children}
            </button>
          </DropdownMenuTrigger>
        </HoverCardTrigger>
        <FileLinkMenu file={file} actions={actions} preview={() => setPreview(true)} />
      </DropdownMenu>
      <HoverCardContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="inline-hover-preview"
      >
        <div className="hover-preview-heading">
          <strong>{file.name}</strong>
          <span>Aktuální obsah</span>
        </div>
        {file.meta.startsWith('Pro tento') ? (
          <div className="unavailable">{file.meta}</div>
        ) : (
          <PreviewContent file={file} updated={updated} />
        )}
        <div className="hover-preview-path">{file.path}</div>
        {updated && ['code', 'image'].includes(file.kind) ? (
          <div className="hover-preview-note">Změněno od prvního náhledu</div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}

export function InlinePreviews({
  text,
  actions,
  updated = false,
  placement = 'hover'
}: {
  text: string
  actions: FileActions
  updated?: boolean
  placement?: 'hover' | 'paragraph' | 'end'
}) {
  const layout = useMemo(() => collectPreviewGroups(text), [text])
  const previews = (items: PreviewFile[]) =>
    items.length ? (
      <div className="context-previews">
        {items.map((file) => (
          <FileCard key={file.id} file={file} actions={actions} updated={updated} />
        ))}
      </div>
    ) : null
  return (
    <div className="inline-response">
      <Markdown
        remarkPlugins={[remarkGfm, remarkNativeChatFileLinks]}
        components={{
          p: ({ node, children }) => (
            <div className="response-block">
              <p>{children}</p>
              {placement === 'paragraph'
                ? previews(layout.groups.get(node?.position?.start.offset ?? -1) ?? [])
                : null}
            </div>
          ),
          ul: ({ node, children }) => (
            <div className="response-block">
              <ul>{children}</ul>
              {placement === 'paragraph'
                ? previews(layout.groups.get(node?.position?.start.offset ?? -1) ?? [])
                : null}
            </div>
          ),
          ol: ({ node, children }) => (
            <div className="response-block">
              <ol>{children}</ol>
              {placement === 'paragraph'
                ? previews(layout.groups.get(node?.position?.start.offset ?? -1) ?? [])
                : null}
            </div>
          ),
          a: ({ href, children }) => {
            const file = resolveFixture(href ?? '')
            return file ? (
              <InlineLink file={file} actions={actions} updated={updated}>
                {children}
              </InlineLink>
            ) : (
              <span>{children}</span>
            )
          }
        }}
      >
        {text}
      </Markdown>
      {placement === 'end' ? (
        <section className="response-artifacts">
          <h3>Odkazované soubory a zdroje · {layout.all.length}</h3>
          {previews(layout.all)}
        </section>
      ) : null}
    </div>
  )
}
