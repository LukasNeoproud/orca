import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { MobileFilePreviewSourceText } from './MobileFilePreviewSourceText'
import {
  isolatedMobileContextualHtml,
  shouldLoadMobileContextualHtmlUrl
} from './mobile-contextual-html-policy'
import { contextualPreviewStyles as styles } from './mobile-contextual-preview-styles'

export function MobileContextualHtmlPreview(props: {
  filePath: string
  content: string
  truncated: boolean
  byteLength: number
}) {
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  return (
    <View style={styles.htmlContainer}>
      <View style={styles.htmlToolbar} accessibilityRole="tablist">
        {(['preview', 'source'] as const).map((option) => {
          const selected = mode === option
          return (
            <Pressable
              key={option}
              style={[styles.htmlModeButton, selected && styles.htmlModeButtonActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setMode(option)}
            >
              <Text
                style={[styles.htmlModeButtonText, selected && styles.htmlModeButtonTextActive]}
              >
                {option === 'preview' ? 'Preview' : 'Source'}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {mode === 'preview' ? (
        <WebView
          style={styles.htmlWebView}
          source={{ html: isolatedMobileContextualHtml(props.content) }}
          originWhitelist={['about:blank']}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          incognito
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          nestedScrollEnabled
          onShouldStartLoadWithRequest={(request) => shouldLoadMobileContextualHtmlUrl(request.url)}
        />
      ) : (
        <MobileFilePreviewSourceText
          relativePath={props.filePath}
          content={props.content}
          truncated={props.truncated}
          byteLength={props.byteLength}
          nestedScrollEnabled
        />
      )}
    </View>
  )
}
