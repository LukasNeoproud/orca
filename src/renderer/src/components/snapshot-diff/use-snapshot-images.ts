import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SnapshotDiffEntry, SnapshotDiffImages } from './snapshot-diff-entries'

export type SnapshotImagesLoader = (entry: SnapshotDiffEntry) => Promise<SnapshotDiffImages | null>

export type SnapshotImagesState =
  | { kind: 'loading' }
  | { kind: 'ready'; images: SnapshotDiffImages }
  /** The loader answered, but with nothing an image pane can show. */
  | { kind: 'no-preview' }
  | { kind: 'error'; message: string }

// Why so few: each entry holds both sides of a screenshot as base64.
const LOADED_IMAGES_LIMIT = 8

/**
 * Both sides of the selected snapshot. With a `revisionKey` the last few stay
 * loaded, so going back is instant; without one every selection reloads.
 */
export function useSnapshotImages(
  entry: SnapshotDiffEntry | null,
  loadImages: SnapshotImagesLoader,
  revisionKey: string | null
): { state: SnapshotImagesState; retry: () => void } {
  const loadedRef = useRef(new Map<string, SnapshotDiffImages>())
  const [settled, setSettled] = useState<{ request: object; state: SnapshotImagesState } | null>(
    null
  )
  const [attempt, setAttempt] = useState(0)
  const entryKey = entry?.key ?? null
  // Why an object: one identity per (snapshot, revision, loader, attempt), so a stale answer never lands.
  const request = useMemo(
    () => ({ entryKey, revisionKey, loadImages, attempt }),
    [attempt, entryKey, loadImages, revisionKey]
  )
  const entryRef = useRef(entry)
  useLayoutEffect(() => {
    entryRef.current = entry
  })

  useEffect(() => {
    const current = entryRef.current
    if (!current || request.entryKey === null) {
      return
    }
    const loaded = loadedRef.current
    const cacheKey =
      request.revisionKey === null ? null : `${request.revisionKey}\0${request.entryKey}`
    const cached = cacheKey === null ? undefined : loaded.get(cacheKey)
    if (cached) {
      setSettled({ request, state: { kind: 'ready', images: cached } })
      return
    }
    let active = true
    request
      .loadImages(current)
      .then((images): SnapshotImagesState => {
        if (!images) {
          return { kind: 'no-preview' }
        }
        if (cacheKey !== null) {
          if (loaded.size >= LOADED_IMAGES_LIMIT) {
            const oldest = loaded.keys().next().value
            if (oldest !== undefined) {
              loaded.delete(oldest)
            }
          }
          loaded.set(cacheKey, images)
        }
        return { kind: 'ready', images }
      })
      .catch((error: unknown): SnapshotImagesState => ({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error)
      }))
      .then((state) => {
        if (active) {
          setSettled({ request, state })
        }
      })
    return () => {
      active = false
    }
  }, [request])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return {
    state: settled && settled.request === request ? settled.state : { kind: 'loading' },
    retry
  }
}
