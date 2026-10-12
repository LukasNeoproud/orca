import type {
  RuntimeNativeChatFileContext,
  RuntimeTerminalPathResolution
} from '../../../src/shared/runtime-types'
import { splitFilePathLineSuffix } from '../components/markdown-file-path-detection'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import {
  loadMobileFilePreview,
  previewError,
  type MobileFilePreviewResult,
  type MobileFilePreviewSource
} from './mobile-file-preview-request'

export type MobileContextualFileTarget = {
  pathText: string
  line: number | null
  column: number | null
  terminalHandle?: string
  cwd?: string
  nativeChatContext?: RuntimeNativeChatFileContext
}

export type MobileContextualFileResolution =
  | {
      status: 'resolved'
      source: MobileFilePreviewSource
      displayPath: string
      line: number | null
      outsideWorkspace: boolean
    }
  | { status: 'error'; preview: MobileFilePreviewResult }

type PreviewClient = Pick<RpcClient, 'sendRequest'>

export async function resolveMobileContextualFilePreview(
  client: PreviewClient,
  worktreeId: string,
  target: MobileContextualFileTarget
): Promise<MobileContextualFileResolution> {
  const parsed = splitFilePathLineSuffix(target.pathText)
  const pathText = target.line === null ? parsed.path : target.pathText
  const line = target.line ?? parsed.line
  const response = await client.sendRequest(
    'files.resolveTerminalPath',
    {
      worktree: `id:${worktreeId}`,
      pathText,
      crossWorkspace: true,
      ...(target.terminalHandle ? { terminal: target.terminalHandle } : {}),
      ...(target.cwd ? { cwd: target.cwd } : {}),
      ...(target.nativeChatContext ? { nativeChatContext: target.nativeChatContext } : {})
    },
    { timeoutMs: 10_000 }
  )
  if (!response.ok) {
    return { status: 'error', preview: previewError(response.error.message) }
  }
  const resolved = (response as RpcSuccess).result as RuntimeTerminalPathResolution
  if (!resolved.exists) {
    return { status: 'error', preview: previewError('file not found') }
  }
  if (resolved.isDirectory) {
    return { status: 'error', preview: previewError('Unable to preview a directory') }
  }
  const resolvedWorktreeId = resolved.worktree?.trim() || worktreeId
  if (resolved.openTarget?.kind === 'absolute-file') {
    return {
      status: 'resolved',
      source: {
        source: 'terminalArtifact',
        worktreeId: resolvedWorktreeId,
        absolutePath: resolved.openTarget.absolutePath,
        grantId: resolved.openTarget.grantId,
        pathText,
        ...(target.terminalHandle ? { terminalHandle: target.terminalHandle } : {}),
        ...(target.cwd ? { cwd: target.cwd } : {}),
        ...(target.nativeChatContext ? { nativeChatContext: target.nativeChatContext } : {}),
        readOnly: true
      },
      displayPath: resolved.openTarget.absolutePath,
      line,
      outsideWorkspace: true
    }
  }
  const relativePath =
    resolved.openTarget?.kind === 'worktree-file'
      ? resolved.openTarget.relativePath
      : resolved.relativePath
  if (!relativePath) {
    return { status: 'error', preview: previewError('Unsupported file target') }
  }
  return {
    status: 'resolved',
    source: { source: 'worktree', worktreeId: resolvedWorktreeId, relativePath },
    displayPath: relativePath,
    line,
    outsideWorkspace: false
  }
}

export function loadResolvedMobileContextualFilePreview(
  client: PreviewClient,
  source: MobileFilePreviewSource,
  onSourceRefreshed: (source: MobileFilePreviewSource) => void
): Promise<MobileFilePreviewResult> {
  return loadMobileFilePreview(client, source, undefined, {
    refreshGrant: true,
    onTerminalArtifactSourceRefreshed: onSourceRefreshed
  })
}

export function mobileContextualPreviewSignature(preview: MobileFilePreviewResult): string | null {
  if (preview.status === 'empty') {
    return `empty:${preview.kind}`
  }
  if (preview.status !== 'ready') {
    return null
  }
  if (preview.kind === 'media') {
    return `media:${preview.media.mimeType}:${preview.media.relativePath}`
  }
  const content = preview.kind === 'image' ? preview.dataUri : preview.content
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const readState =
    preview.kind === 'image'
      ? ''
      : `:${preview.byteLength}:${preview.truncated ? 'truncated' : 'full'}`
  return `${preview.kind}:${content.length}:${hash >>> 0}${readState}`
}
