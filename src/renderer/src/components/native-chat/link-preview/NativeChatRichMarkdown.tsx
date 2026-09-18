import { Children, isValidElement, useMemo, type ComponentProps, type ReactNode } from 'react'
import type { Element } from 'hast'
import { createDocumentCommentMarkdownComponents } from '@/components/sidebar/comment-markdown-element-renderers'
import type { Components } from 'react-markdown'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import {
  GitHubUserAttachmentVideo,
  isGitHubUserAttachmentVideoLink
} from '@/components/sidebar/comment-markdown-github-attachment-media'
import { isMermaidPre } from '@/components/sidebar/comment-mermaid-fence'
import { useAppStore } from '@/store'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'
import { NativeChatLinkPreviewCard } from './NativeChatLinkPreviewCard'
import { NativeChatPreviewLink } from './NativeChatPreviewLink'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'
import { chatPreviewHrefs, rehypeChatPreviewGroups } from './rehype-chat-preview-groups'

type Props = ComponentProps<typeof CommentMarkdown> & {
  runtimeContext?: RuntimeFileOperationArgs | null
  enablePreviews?: boolean
}
export function NativeChatRichMarkdown({ runtimeContext, enablePreviews = true, ...props }: Props) {
  const mode = useAppStore((state) => state.settings?.nativeChatLinkPreviewMode ?? 'hover')
  const plugins = useMemo(
    () => (enablePreviews && mode === 'paragraph' ? [rehypeChatPreviewGroups(runtimeContext)] : []),
    [enablePreviews, mode, runtimeContext]
  )
  const overrides = useMemo<Components>(() => {
    const components: Components = {
      pre: ({ children }) => {
        if (isMermaidPre(children)) {
          return <>{children}</>
        }
        const child = Children.toArray(children)[0]
        const code = isValidElement<{ children?: unknown; className?: string }>(child)
          ? child.props
          : null
        if (!code) {
          return <pre>{children}</pre>
        }
        return (
          <NativeChatHighlightedCode
            content={String(code.children ?? '').replace(/\n$/, '')}
            language={code.className?.replace(/^language-/, '')}
          />
        )
      }
    }
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
          onLinkClick={props.onLinkClick}
        >
          {children}
        </NativeChatPreviewLink>
      )
    const base = createDocumentCommentMarkdownComponents(props.onLinkClick)
    function block(
      tag: 'p' | 'ul' | 'ol' | 'blockquote' | 'table' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    ) {
      return ({ children, node }: { children?: ReactNode; node?: Element }) => {
        const Tag = base[tag] ?? tag
        const targets = chatPreviewHrefs(node).flatMap((href) => {
          const target = resolveChatPreviewTarget(href, runtimeContext)
          return target ? [target] : []
        })
        return (
          <>
            <Tag>{children}</Tag>
            {targets?.map((target) => (
              <NativeChatLinkPreviewCard
                key={target.key}
                target={target}
                runtimeContext={runtimeContext}
                onLinkClick={props.onLinkClick}
              />
            ))}
          </>
        )
      }
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
  }, [enablePreviews, mode, props.onLinkClick, runtimeContext])
  return <CommentMarkdown {...props} componentOverrides={overrides} extraRehypePlugins={plugins} />
}
