import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors } from '../theme/mobile-theme'
import type { ConnectionState } from '../transport/types'
import type { RpcClient } from '../transport/rpc-client'
import {
  MobileFilePreviewSourceText,
  MobileFilePreviewTruncatedNote
} from './MobileFilePreviewSourceText'
import { MobileContextualHtmlPreview } from './MobileContextualHtmlPreview'
import { contextualPreviewStyles as styles } from './mobile-contextual-preview-styles'
import type { MobileContextualFileTarget } from './mobile-contextual-file-preview'
import { useMobileContextualFilePreview } from './use-mobile-contextual-file-preview'

export function MobileContextualFilePreviewCard(props: {
  client: Pick<RpcClient, 'sendRequest'> | null
  connectionState: ConnectionState
  worktreeId: string
  target: MobileContextualFileTarget
}) {
  const model = useMobileContextualFilePreview(props)
  const imageUri =
    model.preview.status === 'ready' && model.preview.kind === 'image'
      ? model.preview.dataUri
      : null
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null)
  useEffect(() => {
    if (imageUri !== failedImageUri) {
      setFailedImageUri(null)
    }
  }, [failedImageUri, imageUri])
  const imageFailed = imageUri !== null && imageUri === failedImageUri
  return (
    <View style={styles.card} accessibilityLabel="Current file preview">
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          Current file · {model.displayPath}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Reload current file preview"
          onPress={model.reload}
        >
          <RefreshCw size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.body}>
        {model.needsConsent ? (
          <PreviewState
            message="This file is outside the conversation workspace. Load its current content?"
            actionLabel="Load Preview"
            onAction={model.approveOutsideWorkspace}
          />
        ) : model.preview.status === 'loading' || model.preview.status === 'waiting' ? (
          <View style={styles.state} accessibilityRole="progressbar">
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.stateText}>{model.preview.message}</Text>
          </View>
        ) : model.preview.status === 'error' ? (
          <PreviewState
            message={model.preview.message}
            actionLabel="Retry"
            onAction={model.reload}
          />
        ) : model.preview.status === 'empty' ? (
          <View style={styles.state}>
            <Text style={styles.emptyText}>Current file is empty</Text>
          </View>
        ) : model.preview.kind === 'image' && imageFailed ? (
          <PreviewState
            message="Unable to display image preview"
            actionLabel="Retry"
            onAction={model.reload}
          />
        ) : model.preview.kind === 'image' ? (
          <View style={styles.imageFrame}>
            <Image
              source={{ uri: model.preview.dataUri }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={`${model.displayPath} current image preview`}
              onError={() => setFailedImageUri(imageUri)}
            />
          </View>
        ) : model.preview.kind === 'media' ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>Open this file to play it</Text>
          </View>
        ) : model.preview.kind === 'markdown' ? (
          <ScrollView
            style={styles.markdownScroll}
            contentContainerStyle={styles.markdownContent}
            nestedScrollEnabled
          >
            {model.preview.truncated ? (
              <MobileFilePreviewTruncatedNote byteLength={model.preview.byteLength} />
            ) : null}
            <MobileMarkdown content={model.preview.content} />
          </ScrollView>
        ) : model.preview.kind === 'html' ? (
          <MobileContextualHtmlPreview
            filePath={model.displayPath}
            content={model.preview.content}
            truncated={model.preview.truncated}
            byteLength={model.preview.byteLength}
          />
        ) : (
          <MobileFilePreviewSourceText
            relativePath={model.displayPath}
            content={model.preview.content}
            truncated={model.preview.truncated}
            byteLength={model.preview.byteLength}
            initialLine={model.line ?? undefined}
            nestedScrollEnabled
          />
        )}
      </View>
      <View style={styles.footer}>
        <Text style={[styles.footerText, model.changed && styles.footerTextChanged]}>
          {model.changed
            ? 'Changed since first load · showing current host content'
            : 'Preview reads current host content · message text may be historical'}
        </Text>
      </View>
    </View>
  )
}

function PreviewState(props: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <View style={styles.state} accessibilityRole="alert">
      <Text style={styles.stateText}>{props.message}</Text>
      <Pressable
        style={({ pressed }) => [styles.stateButton, pressed && styles.stateButtonPressed]}
        accessibilityRole="button"
        onPress={props.onAction}
      >
        <Text style={styles.stateButtonText}>{props.actionLabel}</Text>
      </Pressable>
    </View>
  )
}
