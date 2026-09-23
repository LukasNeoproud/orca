import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionState } from '../transport/types'
import type { RpcClient } from '../transport/rpc-client'
import {
  loadResolvedMobileContextualFilePreview,
  mobileContextualPreviewSignature,
  resolveMobileContextualFilePreview,
  type MobileContextualFileTarget
} from './mobile-contextual-file-preview'
import {
  previewError,
  type MobileFilePreviewResult,
  type MobileFilePreviewSource
} from './mobile-file-preview-request'

type ContextualPreviewResolution = {
  generation: number
  displayPath: string
  line: number | null
  outsideWorkspace: boolean
}

export type MobileContextualFilePreviewModel = {
  preview: MobileFilePreviewResult
  displayPath: string
  line: number | null
  needsConsent: boolean
  changed: boolean
  approveOutsideWorkspace: () => void
  reload: () => void
}

export function useMobileContextualFilePreview(args: {
  client: Pick<RpcClient, 'sendRequest'> | null
  connectionState: ConnectionState
  worktreeId: string
  target: MobileContextualFileTarget
}): MobileContextualFilePreviewModel {
  const { client, connectionState, target, worktreeId } = args
  const targetKey = JSON.stringify([worktreeId, target])
  const [reloadGeneration, setReloadGeneration] = useState(0)
  const [approvedOutsideKey, setApprovedOutsideKey] = useState<string | null>(null)
  const [resolution, setResolution] = useState<ContextualPreviewResolution | null>(null)
  const [preview, setPreview] = useState<MobileFilePreviewResult>({
    status: 'loading',
    message: 'Resolving current file...'
  })
  const [changed, setChanged] = useState(false)
  const sourceRef = useRef<MobileFilePreviewSource | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const requestGenerationRef = useRef(0)
  const baselineRef = useRef<{ key: string; signature: string | null }>({
    key: targetKey,
    signature: null
  })

  useEffect(() => {
    requestGenerationRef.current += 1
    const requestGeneration = requestGenerationRef.current
    sourceRef.current = null
    setResolution(null)
    setChanged(false)
    if (baselineRef.current.key !== targetKey) {
      baselineRef.current = { key: targetKey, signature: null }
      setApprovedOutsideKey(null)
    }
    if (!client || connectionState !== 'connected') {
      setPreview(previewError('provider unavailable'))
      return
    }
    setPreview({ status: 'loading', message: 'Resolving current file...' })
    void resolveMobileContextualFilePreview(client, worktreeId, targetRef.current)
      .then((next) => {
        if (requestGeneration !== requestGenerationRef.current) {
          return
        }
        if (next.status === 'error') {
          setPreview(next.preview)
          return
        }
        sourceRef.current = next.source
        setResolution({
          generation: reloadGeneration,
          displayPath: next.displayPath,
          line: next.line,
          outsideWorkspace: next.outsideWorkspace
        })
        if (next.outsideWorkspace) {
          setPreview({ status: 'loading', message: 'Waiting for approval...' })
        }
      })
      .catch((error) => {
        if (requestGeneration === requestGenerationRef.current) {
          setPreview(previewError(error instanceof Error ? error.message : String(error)))
        }
      })
  }, [client, connectionState, reloadGeneration, targetKey, worktreeId])

  useEffect(() => {
    if (
      !client ||
      !resolution ||
      resolution.generation !== reloadGeneration ||
      !sourceRef.current ||
      (resolution.outsideWorkspace && approvedOutsideKey !== targetKey)
    ) {
      return
    }
    const requestGeneration = requestGenerationRef.current
    setPreview({ status: 'loading', message: 'Loading current content...' })
    void loadResolvedMobileContextualFilePreview(client, sourceRef.current, (source) => {
      sourceRef.current = source
    })
      .then((next) => {
        if (requestGeneration !== requestGenerationRef.current) {
          return
        }
        const signature = mobileContextualPreviewSignature(next)
        if (signature !== null) {
          if (baselineRef.current.signature === null) {
            baselineRef.current.signature = signature
          }
          setChanged(baselineRef.current.signature !== signature)
        }
        setPreview(next)
      })
      .catch((error) => {
        if (requestGeneration === requestGenerationRef.current) {
          setPreview(previewError(error instanceof Error ? error.message : String(error)))
        }
      })
  }, [approvedOutsideKey, client, reloadGeneration, resolution, targetKey])

  const approveOutsideWorkspace = useCallback(() => {
    setApprovedOutsideKey(targetKey)
  }, [targetKey])
  const reload = useCallback(() => {
    setReloadGeneration((generation) => generation + 1)
  }, [])

  return {
    preview,
    displayPath: resolution?.displayPath ?? target.pathText,
    line: resolution?.line ?? target.line,
    needsConsent: resolution?.outsideWorkspace === true && approvedOutsideKey !== targetKey,
    changed,
    approveOutsideWorkspace,
    reload
  }
}
