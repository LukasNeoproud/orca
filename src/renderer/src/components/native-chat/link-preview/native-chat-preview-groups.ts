import { routeNativeChatHref } from '../../../../../shared/native-chat-href-routing'
import { resolveNativeChatFileLink } from '../native-chat-file-link'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'

export type ChatPreviewTarget = {
  href: string
  key: string
  path: string
  line: number | null
  kind: 'file' | 'web'
}
export function resolveChatPreviewTarget(
  href: string,
  context?: RuntimeFileOperationArgs | null
): ChatPreviewTarget | null {
  const route = routeNativeChatHref(href)
  if (route.kind === 'web' && /^https?:\/\//i.test(route.url)) {
    try {
      new URL(route.url)
      return { href, key: route.url, path: route.url, line: null, kind: 'web' }
    } catch {
      return null
    }
  }
  if (route.kind !== 'file' || !context?.worktreeId || !context.worktreePath) {
    return null
  }
  const file = resolveNativeChatFileLink(href, {
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    runtimeEnvironmentId: runtimeTargetEnvironmentId(context.target)
  })
  return file
    ? { href, key: file.absolutePath, path: file.absolutePath, line: file.line, kind: 'file' }
    : null
}
