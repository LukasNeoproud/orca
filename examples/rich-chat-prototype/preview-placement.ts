import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { remarkNativeChatFileLinks } from '@/components/sidebar/comment-markdown-native-chat-file-links'
import { routeNativeChatHref } from '../../src/shared/native-chat-href-routing'
import { files, type PreviewFile } from './fixtures'

export function resolveFixture(href: string): PreviewFile | null {
  const route = routeNativeChatHref(href)
  if (route.kind === 'none') {
    return null
  }
  const path = route.kind === 'web' ? route.url : route.pathText
  const name =
    path
      .replace(/:\d+(?:[–-]\d+)?$/, '')
      .split(/[\\/]/)
      .pop() ?? path
  const match = files.find((file) =>
    route.kind === 'web' ? file.path === path : file.name === name
  )
  return match
    ? { ...match, path }
    : {
        id: path,
        name,
        path,
        kind: route.kind === 'web' ? 'web' : 'binary',
        meta: 'Pro tento odkaz nejsou v prototypu ukázková data',
        status: 'missing'
      }
}

type LinkNode = {
  type: string
  url?: string
  children?: LinkNode[]
  position?: { start: { offset?: number } }
}
export function collectPreviewGroups(text: string) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkNativeChatFileLinks)
  const tree = processor.runSync(processor.parse(text)) as LinkNode
  const seen = new Set<string>()
  const groups = new Map<number, PreviewFile[]>()
  const all: PreviewFile[] = []
  function collect(node: LinkNode, group: PreviewFile[]) {
    if (node.type === 'link' && node.url) {
      const file = resolveFixture(node.url)
      if (file && !seen.has(file.id)) {
        seen.add(file.id)
        group.push(file)
        all.push(file)
      }
    }
    for (const child of node.children ?? []) {
      collect(child, group)
    }
  }
  for (const block of tree.children ?? []) {
    const group: PreviewFile[] = []
    collect(block, group)
    if (group.length && block.position?.start.offset !== undefined) {
      groups.set(block.position.start.offset, group)
    }
  }
  return { groups, all }
}
