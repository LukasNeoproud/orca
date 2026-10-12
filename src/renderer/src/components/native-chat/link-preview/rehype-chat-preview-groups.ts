import type { Element, Root, RootContent } from 'hast'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { resolveChatPreviewTarget } from './native-chat-preview-groups'

const groupTags = new Set([
  'p',
  'ul',
  'ol',
  'blockquote',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
])

/** Runs after sanitization and shares the transcript's existing Markdown parse. */
export function rehypeChatPreviewGroups(context?: RuntimeFileOperationArgs | null) {
  return () =>
    (tree: Root): void => {
      const seen = new Set<string>()
      function collect(node: RootContent, hrefs: string[]): void {
        if (node.type !== 'element' || node.tagName === 'pre' || node.tagName === 'code') {
          return
        }
        if (node.tagName === 'a' && typeof node.properties.href === 'string') {
          const target = resolveChatPreviewTarget(node.properties.href, context)
          if (target && !seen.has(target.key)) {
            seen.add(target.key)
            hrefs.push(target.href)
          }
        }
        for (const child of node.children) {
          collect(child, hrefs)
        }
      }
      function group(node: RootContent): void {
        if (node.type !== 'element') {
          return
        }
        if (groupTags.has(node.tagName)) {
          const hrefs: string[] = []
          collect(node, hrefs)
          if (hrefs.length) {
            node.properties.dataChatPreviewHrefs = hrefs
          }
        } else if (node.tagName !== 'pre' && node.tagName !== 'code') {
          for (const child of node.children) {
            group(child)
          }
        }
      }
      for (const child of tree.children) {
        group(child)
      }
    }
}

export function chatPreviewHrefs(node?: Element): string[] {
  const values = node?.properties.dataChatPreviewHrefs
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string')
    : []
}
