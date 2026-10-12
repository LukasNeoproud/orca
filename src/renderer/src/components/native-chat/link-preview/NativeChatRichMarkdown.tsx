import { useMemo, type ComponentProps, type ReactNode } from 'react'
import type { Element } from 'hast'
import { createDocumentCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import type { Components } from 'react-markdown'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import {
  GitHubUserAttachmentVideo,
  isGitHubUserAttachmentVideoLink
} from '@/components/sidebar/comment-markdown-github-attachment-media'
import { useAppStore } from '@/store'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { NativeChatLinkPreviewCard } from './NativeChatLinkPreviewCard'
import { NativeChatPreviewLink } from './NativeChatPreviewLink'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'
import { chatPreviewHrefs, rehypeChatPreviewGroups } from './rehype-chat-preview-groups'

type RichMarkdownOptions = {
  runtimeContext?: RuntimeFileOperationArgs | null
  enablePreviews?: boolean
  onLinkClick?: CommentMarkdownLinkClickHandler
}

/** Link preview props for CommentMarkdown: hover cards, or cards after each paragraph. */
export function useNativeChatRichMarkdownOptions({
  runtimeContext,
  enablePreviews = true,
  onLinkClick
}: RichMarkdownOptions): {
  componentOverrides: Components
  extraRehypePlugins: ReturnType<typeof rehypeChatPreviewGroups>[]
} {
  const mode = useAppStore((state) => state.settings?.nativeChatLinkPreviewMode ?? 'hover')
  const plugins = useMemo(
    () => (enablePreviews && mode === 'paragraph' ? [rehypeChatPreviewGroups(runtimeContext)] : []),
    [enablePreviews, mode, runtimeContext]
  )
  const overrides = useMemo<Components>(() => {
    const components: Components = {}
    if (!enablePreviews) {
      return components
    }
    components.a = ({ href, children }) =>
      isGitHubUserAttachmentVideoLink(href, children) ? (
        <GitHubUserAttachmentVideo href={href}>{children}</GitHubUserAttachmentVideo>
      ) : (
        <NativeChatPreviewLink
          href={href}
          hover={mode === 'hover'}
          runtimeContext={runtimeContext}
          onLinkClick={onLinkClick}
        >
          {children}
        </NativeChatPreviewLink>
      )
    const base = createDocumentCommentMarkdownComponents(onLinkClick)
    function block(
      tag: 'p' | 'ul' | 'ol' | 'blockquote' | 'table' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    ) {
      // Rest carries the element's own attributes, e.g. an ordered list's `start`.
      return ({ children, node, ...props }: { children?: ReactNode; node?: Element }) => {
        const Tag = base[tag] ?? tag
        const targets = chatPreviewHrefs(node).flatMap((href) => {
          const target = resolveChatPreviewTarget(href, runtimeContext)
          return target ? [target] : []
        })
        return (
          <>
            <Tag {...props}>{children}</Tag>
            {targets?.map((target) => (
              <NativeChatLinkPreviewCard
                key={target.key}
                target={target}
                runtimeContext={runtimeContext}
                onLinkClick={onLinkClick}
              />
            ))}
          </>
        )
      }
    }
    // Hover cards need no block wrappers; keep the chat variant's own block renderers.
    if (mode !== 'paragraph') {
      return components
    }
    return {
      ...components,
      p: block('p'),
      ul: block('ul'),
      ol: block('ol'),
      blockquote: block('blockquote'),
      table: block('table'),
      h1: block('h1'),
      h2: block('h2'),
      h3: block('h3'),
      h4: block('h4'),
      h5: block('h5'),
      h6: block('h6')
    }
  }, [enablePreviews, mode, onLinkClick, runtimeContext])
  return useMemo(
    () => ({ componentOverrides: overrides, extraRehypePlugins: plugins }),
    [overrides, plugins]
  )
}

type Props = ComponentProps<typeof CommentMarkdown> & {
  runtimeContext?: RuntimeFileOperationArgs | null
  enablePreviews?: boolean
}
export function NativeChatRichMarkdown({ runtimeContext, enablePreviews = true, ...props }: Props) {
  const options = useNativeChatRichMarkdownOptions({
    runtimeContext,
    enablePreviews,
    onLinkClick: props.onLinkClick
  })
  return <CommentMarkdown {...props} {...options} />
}
