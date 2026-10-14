import { useEffect, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { buildMobileDiffLines } from '../session/mobile-diff-lines'
import {
  highlightMobileDiffLines,
  resolveMobileSyntaxLanguage
} from '../session/mobile-file-syntax'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type {
  AzureDevOpsReviewChange,
  AzureDevOpsReviewDetail,
  AzureDevOpsReviewFileDiff,
  AzureDevOpsReviewFileSide
} from '../../../src/shared/azure-devops-review-types'
import { azureDevOpsReviewRequest } from './use-azure-devops-review'
import { loadAzureDevOpsReviewFileDiff } from './azure-devops-review-file-diff-loader'
import { azureDevOpsReviewDiffExcerpt } from './azure-devops-review-diff-excerpt'
import { azureDevOpsReviewInlineItems } from './azure-devops-review-inline-items'
import { AzureDevOpsReviewDiffLineRow } from './AzureDevOpsReviewDiffLineRow'
import { AzureDevOpsReviewComposer } from './azure-devops-review-composer'
import { reviewStyles } from './azure-devops-review-styles'

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; diff: AzureDevOpsReviewFileDiff }

function ImageSide({ label, side }: { label: string; side: AzureDevOpsReviewFileSide }) {
  const [large, setLarge] = useState(false)
  return (
    <View style={styles.imageSide}>
      <Text style={reviewStyles.muted}>{label}</Text>
      {side.imageMimeType && side.content ? (
        <Pressable
          onPress={() => setLarge((value) => !value)}
          accessibilityRole="imagebutton"
          accessibilityLabel={large ? `Shrink ${label} image` : `Enlarge ${label} image`}
        >
          <Image
            source={{ uri: `data:${side.imageMimeType};base64,${side.content}` }}
            style={[styles.image, large && styles.imageLarge]}
            resizeMode="contain"
          />
        </Pressable>
      ) : (
        <Text style={reviewStyles.muted}>
          {side.missing ? 'Not in this version' : 'No preview'}
        </Text>
      )}
    </View>
  )
}

/** One changed file: changed regions with context, inline threads and drafts, or its images. */
export function AzureDevOpsReviewFileDiff({
  client,
  detail,
  change,
  onChanged
}: {
  client: RpcClient | null
  detail: AzureDevOpsReviewDetail
  change: AzureDevOpsReviewChange
  onChanged: () => Promise<void>
}) {
  const pullRequestKey = detail.pullRequest.key
  const iterationId = detail.latestIteration?.id ?? null
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [composingLine, setComposingLine] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoad({ kind: 'loading' })
    loadAzureDevOpsReviewFileDiff(client, pullRequestKey, iterationId, change)
      .then((diff) => !cancelled && setLoad({ kind: 'ready', diff }))
      .catch(
        (err: unknown) =>
          !cancelled &&
          setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      )
    return () => {
      cancelled = true
    }
  }, [client, pullRequestKey, iterationId, change, attempt])

  const items = useMemo(() => azureDevOpsReviewInlineItems(detail, change.path), [detail, change])
  const text = load.kind === 'ready' && !load.diff.original.binary && !load.diff.modified.binary
  const excerpt = useMemo(() => {
    if (load.kind !== 'ready' || !text) {
      return null
    }
    const built = buildMobileDiffLines(load.diff.original.content, load.diff.modified.content)
    const lines = highlightMobileDiffLines(built.lines, resolveMobileSyntaxLanguage(change.path))
    return {
      rows: azureDevOpsReviewDiffExcerpt(lines, new Set(items.keys())),
      truncated: built.truncated
    }
  }, [load, text, change.path, items])

  if (load.kind === 'loading') {
    return <Text style={reviewStyles.muted}>Loading diff…</Text>
  }
  if (load.kind === 'error') {
    return (
      <View style={styles.message}>
        <Text style={reviewStyles.error}>{load.message}</Text>
        <Pressable style={reviewStyles.button} onPress={() => setAttempt((n) => n + 1)}>
          <Text style={reviewStyles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    )
  }
  const { diff } = load
  if (diff.original.tooLarge || diff.modified.tooLarge) {
    return <Text style={reviewStyles.muted}>This file is too large to show here.</Text>
  }
  if (diff.original.imageMimeType || diff.modified.imageMimeType) {
    return (
      <View style={styles.images}>
        <ImageSide label="Original" side={diff.original} />
        <ImageSide label="Modified" side={diff.modified} />
      </View>
    )
  }
  if (!excerpt) {
    return <Text style={reviewStyles.muted}>Binary file; open it in Azure DevOps to compare.</Text>
  }
  if (excerpt.rows.length === 0) {
    return <Text style={reviewStyles.muted}>No text changes.</Text>
  }
  return (
    <View>
      {excerpt.rows.map((row) => {
        if (row.kind === 'gap') {
          return (
            <Text key={row.key} style={styles.gap}>
              ⋯ {row.hiddenLines} unchanged {row.hiddenLines === 1 ? 'line' : 'lines'}
            </Text>
          )
        }
        const { line } = row
        const right = line.newLineNumber
        return (
          <AzureDevOpsReviewDiffLineRow
            key={row.key}
            line={line}
            items={
              items.get(`right:${right ?? ''}`) ?? items.get(`left:${line.oldLineNumber ?? ''}`)
            }
            onAddDraft={right !== undefined ? () => setComposingLine(right) : undefined}
          >
            {right !== undefined && composingLine === right ? (
              <AzureDevOpsReviewComposer
                saveLabel="Save draft"
                onCancel={() => setComposingLine(null)}
                onSave={async (body) => {
                  await azureDevOpsReviewRequest(client, 'azureDevOpsReview.createDraft', {
                    pullRequestKey,
                    kind: 'inline',
                    filePath: change.path,
                    anchor: { side: 'right', startLine: right, endLine: right },
                    body,
                    author: { kind: 'user' }
                  })
                  setComposingLine(null)
                  await onChanged()
                }}
              />
            ) : null}
          </AzureDevOpsReviewDiffLineRow>
        )
      })}
      {excerpt.truncated ? (
        <Text style={styles.gap}>The diff is cut short on mobile; open it on the desktop.</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  message: { gap: spacing.sm, alignItems: 'flex-start' },
  gap: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.md
  },
  images: { gap: spacing.md },
  imageSide: { gap: spacing.xs },
  image: {
    width: '100%',
    height: 280,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  imageLarge: { height: 640 }
})
