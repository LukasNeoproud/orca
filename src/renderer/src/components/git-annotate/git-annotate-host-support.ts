import {
  getRuntimeGitBlame,
  isGitAnnotateUnsupportedHostError
} from '@/runtime/runtime-git-annotate-client'
import type { GitAnnotateFileContext } from './git-annotate-file-context'
import { useGitAnnotateStore } from './git-annotate-store'

const probesInFlight = new Set<string>()

/**
 * Asks a remote host once whether it knows the annotate queries, so the actions can be disabled
 * before the user reaches for them. An empty blame is the cheapest valid question.
 */
export function probeGitAnnotateHostSupport(context: GitAnnotateFileContext): void {
  const { hostKey } = context
  if (
    !context.remoteHost ||
    useGitAnnotateStore.getState().hostSupport[hostKey] ||
    probesInFlight.has(hostKey)
  ) {
    return
  }
  probesInFlight.add(hostKey)
  getRuntimeGitBlame(context.gitContext, { relativePath: context.relativePath, contents: '' })
    .then(() => useGitAnnotateStore.getState().setHostSupport(hostKey, 'supported'))
    .catch((error: unknown) => {
      // Any other failure says nothing about the host's version; the next editor asks again.
      if (isGitAnnotateUnsupportedHostError(error)) {
        useGitAnnotateStore.getState().setHostSupport(hostKey, 'unsupported')
      }
    })
    .finally(() => probesInFlight.delete(hostKey))
}
