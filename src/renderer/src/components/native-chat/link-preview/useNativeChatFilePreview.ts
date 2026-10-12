import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FsChangedPayload } from '../../../../../shared/filesystem-entry-types'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import { readRuntimeFilePreview } from '@/runtime/runtime-file-read-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { subscribeRuntimeFileChanges } from '@/runtime/runtime-file-watch-client'
import { normalizeRuntimePathForComparison } from '../../../../../shared/cross-platform-path'
import { hasRuntimeRpcErrorCode } from '../../../../../shared/runtime-rpc-error-code'

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024
const BINARY_PREVIEW_MAX_BYTES = 8 * 1024 * 1024

type NativeChatFilePreviewStatus =
  | 'loading'
  | 'ready'
  | 'missing'
  | 'unavailable'
  | 'large'
  | 'error'

export type NativeChatFilePreview = {
  status: NativeChatFilePreviewStatus
  content?: string
  encoding?: 'utf8' | 'base64'
  mimeType?: string
  changed: boolean
  error?: string
  reload: () => void
}

type LoadedPreview = Omit<NativeChatFilePreview, 'reload'> & { mtime?: number }

const inFlightPreviews = new Map<string, Promise<LoadedPreview>>()

function operationKey(context: RuntimeFileOperationArgs, filePath: string): string {
  return [
    runtimeTargetEnvironmentId(context.target) ?? '',
    context.worktreeId ?? '',
    context.worktreePath ?? '',
    context.connectionId ?? '',
    context.expectedExecutionHostId ?? '',
    context.expectedSshTargetId ?? '',
    context.expectedSshConnectionGeneration ?? '',
    context.expectedExternalSshTargetId ?? '',
    filePath
  ].join('\0')
}

function supportsBinaryPreview(filePath: string): boolean {
  const extension = filePath.split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase()
  return (
    extension === 'pdf' ||
    extension === 'avif' ||
    extension === 'bmp' ||
    extension === 'gif' ||
    extension === 'ico' ||
    extension === 'jpeg' ||
    extension === 'jpg' ||
    extension === 'png' ||
    extension === 'svg' ||
    extension === 'webp'
  )
}

function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /enoent|not found|no such file/i.test(message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRuntimeUnavailableError(error: unknown): boolean {
  return (
    hasRuntimeRpcErrorCode(error, 'runtime_unavailable') ||
    hasRuntimeRpcErrorCode(error, 'remote_runtime_unavailable')
  )
}

async function loadPreview(
  key: string,
  context: RuntimeFileOperationArgs,
  filePath: string,
  force: boolean
): Promise<LoadedPreview> {
  const ongoing = inFlightPreviews.get(key)
  if (ongoing && !force) {
    return ongoing
  }
  const load = (async (): Promise<LoadedPreview> => {
    try {
      const stat = await statRuntimePath(context, filePath)
      const maxBytes = supportsBinaryPreview(filePath)
        ? BINARY_PREVIEW_MAX_BYTES
        : TEXT_PREVIEW_MAX_BYTES
      if (stat.isDirectory || stat.size > maxBytes) {
        return { status: 'large', changed: false, mtime: stat.mtime }
      }
      const preview = await readRuntimeFilePreview(context, filePath)
      return {
        status: 'ready',
        content: preview.content,
        encoding: preview.isBinary ? 'base64' : 'utf8',
        mimeType: preview.mimeType,
        changed: false,
        mtime: stat.mtime
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return { status: 'missing', changed: false }
      }
      if (isRuntimeUnavailableError(error)) {
        return { status: 'unavailable', changed: false }
      }
      return { status: 'error', changed: false, error: errorMessage(error) }
    }
  })()
  inFlightPreviews.set(key, load)
  try {
    return await load
  } finally {
    if (inFlightPreviews.get(key) === load) {
      inFlightPreviews.delete(key)
    }
  }
}

function eventTouchesFile(payload: FsChangedPayload, filePath: string): boolean {
  const expected = normalizeRuntimePathForComparison(filePath)
  return payload.events.some(
    (event) =>
      event.kind === 'overflow' ||
      normalizeRuntimePathForComparison(event.absolutePath) === expected ||
      (event.oldAbsolutePath !== undefined &&
        normalizeRuntimePathForComparison(event.oldAbsolutePath) === expected)
  )
}

export function useNativeChatFilePreview(
  filePath: string,
  runtimeContext: RuntimeFileOperationArgs | null | undefined,
  enabled: boolean
): NativeChatFilePreview {
  const [reloadGeneration, setReloadGeneration] = useState(0)
  const [preview, setPreview] = useState<LoadedPreview>({ status: 'unavailable', changed: false })
  const originalMtimeRef = useRef<number | undefined>(undefined)
  const originalMtimeKeyRef = useRef<string | null>(null)
  const requestGenerationRef = useRef(0)
  const contextKey = runtimeContext ? operationKey(runtimeContext, filePath) : ''
  const active =
    enabled && runtimeContext !== null && runtimeContext !== undefined && filePath.length > 0
  const reload = useCallback(() => {
    setReloadGeneration((generation) => generation + 1)
  }, [])

  useEffect(() => {
    if (originalMtimeKeyRef.current !== contextKey) {
      originalMtimeKeyRef.current = contextKey
      originalMtimeRef.current = undefined
    }
    requestGenerationRef.current += 1
    if (!active || !runtimeContext) {
      setPreview({ status: 'unavailable', changed: false })
      return
    }
    const requestGeneration = requestGenerationRef.current
    let disposed = false
    setPreview({ status: 'loading', changed: false })
    void loadPreview(contextKey, runtimeContext, filePath, reloadGeneration > 0).then((next) => {
      if (disposed || requestGeneration !== requestGenerationRef.current) {
        return
      }
      if (next.mtime !== undefined && originalMtimeRef.current === undefined) {
        originalMtimeRef.current = next.mtime
      }
      setPreview({
        ...next,
        changed:
          originalMtimeRef.current !== undefined &&
          next.mtime !== undefined &&
          originalMtimeRef.current !== next.mtime
      })
    })
    return () => {
      disposed = true
    }
  }, [active, contextKey, filePath, reloadGeneration, runtimeContext])

  useEffect(() => {
    if (!active || !runtimeContext) {
      return
    }
    let disposed = false
    let unsubscribe: (() => void) | undefined
    const refreshIfTouched = (payload: FsChangedPayload): void => {
      if (eventTouchesFile(payload, filePath)) {
        reload()
      }
    }
    void subscribeRuntimeFileChanges(runtimeContext, refreshIfTouched)
      .then((stop) => {
        if (disposed) {
          stop()
        } else {
          unsubscribe = stop
        }
      })
      .catch(() => {})
    const refreshOnFocus = (): void => reload()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      disposed = true
      unsubscribe?.()
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [active, filePath, reload, runtimeContext])

  return useMemo(() => {
    const { mtime: _mtime, ...state } = preview
    return { ...state, reload }
  }, [preview, reload])
}

export function resetNativeChatFilePreviewCacheForTests(): void {
  inFlightPreviews.clear()
}
