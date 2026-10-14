import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import { reviewStyles as styles } from './azure-devops-review-styles'

/** Multiline body editor with Cancel/Save; used for new replies and draft edits. */
export function AzureDevOpsReviewComposer({
  initialBody = '',
  saveLabel,
  placeholder = 'Write a comment (Markdown)',
  onSave,
  onCancel
}: {
  initialBody?: string
  saveLabel: string
  placeholder?: string
  onSave: (body: string) => Promise<void>
  onCancel: () => void
}) {
  const [body, setBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = body.trim().length > 0 && !saving

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        autoFocus
        multiline
        value={body}
        onChangeText={setBody}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel="Draft comment"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          style={styles.button}
          onPress={onCancel}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonPrimary, !canSave && styles.disabled]}
          disabled={!canSave}
          accessibilityRole="button"
          onPress={async () => {
            setSaving(true)
            setError(null)
            try {
              await onSave(body)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setSaving(false)
            }
          }}
        >
          <Text style={styles.buttonPrimaryText}>{saveLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}
