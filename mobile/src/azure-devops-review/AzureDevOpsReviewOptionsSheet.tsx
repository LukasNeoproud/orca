import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  AZURE_DEVOPS_REVIEW_CHECKS,
  normalizeAzureDevOpsReviewOptions,
  type AzureDevOpsReviewCheck,
  type AzureDevOpsReviewOptions
} from '../../../src/shared/azure-devops-review-options'
import { reviewStyles } from './azure-devops-review-styles'

const OPTIONS_KEY = 'orca.azureDevOpsReview.agentOptions'

/** The options the last review started with; any read failure yields the defaults. */
export async function readAzureDevOpsReviewOptions(): Promise<AzureDevOpsReviewOptions> {
  try {
    return normalizeAzureDevOpsReviewOptions(
      JSON.parse((await AsyncStorage.getItem(OPTIONS_KEY)) ?? 'null')
    )
  } catch {
    return normalizeAzureDevOpsReviewOptions(null)
  }
}

const CHECK_LABELS: Record<AzureDevOpsReviewCheck, { title: string; hint: string }> = {
  lint: { title: 'Linters and format checks', hint: "Runs the repository's linters." },
  'full-test-suite': { title: 'Full test suite', hint: 'Every test; can take a long time.' },
  'dependency-audit': {
    title: 'Dependency audit',
    hint: 'Checks changed packages for known vulnerabilities.'
  },
  security: { title: 'Security pass', hint: 'Injection, auth, secrets and input validation.' }
}

function Choice<T extends string>({
  label,
  value,
  choices,
  onChange
}: {
  label: string
  value: T
  choices: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {choices.map((choice) => (
          <Pressable
            key={choice.value}
            style={[styles.choice, value === choice.value && styles.choiceSelected]}
            onPress={() => onChange(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === choice.value }}
          >
            <Text style={styles.choiceText}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** Collects language, depth, permissions and extra checks before an AI review starts. */
export function AzureDevOpsReviewOptionsSheet({
  visible,
  subject,
  onStart,
  onCancel
}: {
  visible: boolean
  subject: string
  onStart: (options: AzureDevOpsReviewOptions) => void
  onCancel: () => void
}) {
  const [options, setOptions] = useState(() => normalizeAzureDevOpsReviewOptions(null))
  useEffect(() => {
    if (visible) {
      void readAzureDevOpsReviewOptions().then(setOptions)
    }
  }, [visible])
  const update = (patch: Partial<AzureDevOpsReviewOptions>): void =>
    setOptions((current) => ({ ...current, ...patch }))
  const runsCode = options.depth !== 'static'

  return (
    <BottomDrawer visible={visible} onClose={onCancel}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>AI review</Text>
        <Text style={reviewStyles.meta} numberOfLines={2}>
          {subject}
        </Text>
        <Choice
          label="Comment language"
          value={options.language}
          choices={[
            { value: 'cs', label: 'Czech' },
            { value: 'en', label: 'English' }
          ]}
          onChange={(language) => update({ language })}
        />
        <Choice
          label="Review depth"
          value={options.depth}
          choices={[
            { value: 'static', label: 'Static' },
            { value: 'build', label: 'Build' },
            { value: 'build-and-test', label: 'Build and test' }
          ]}
          onChange={(depth) => update({ depth })}
        />
        <Choice
          label="Permissions"
          value={options.permissions}
          choices={[
            { value: 'auto', label: 'Auto' },
            { value: 'settings', label: 'Agent setting' }
          ]}
          onChange={(permissions) => update({ permissions })}
        />
        <View style={styles.field}>
          <Text style={styles.label}>Additional checks</Text>
          {AZURE_DEVOPS_REVIEW_CHECKS.map((check) => {
            // Checks that execute code only apply once the review builds.
            const available = runsCode || check === 'security'
            return (
              <View key={check} style={styles.check}>
                <View style={styles.checkText}>
                  <Text style={[reviewStyles.body, !available && reviewStyles.disabled]}>
                    {CHECK_LABELS[check].title}
                  </Text>
                  <Text style={reviewStyles.muted}>{CHECK_LABELS[check].hint}</Text>
                </View>
                <Switch
                  value={available && options.checks.includes(check)}
                  disabled={!available}
                  onValueChange={(on) =>
                    update({
                      checks: on
                        ? [...options.checks, check]
                        : options.checks.filter((existing) => existing !== check)
                    })
                  }
                  accessibilityLabel={CHECK_LABELS[check].title}
                />
              </View>
            )
          })}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Setup notes for the agent</Text>
          <TextInput
            multiline
            value={options.instructions}
            onChangeText={(instructions) => update({ instructions })}
            placeholder="For example: tests need Docker running."
            placeholderTextColor={colors.textMuted}
            style={reviewStyles.input}
          />
        </View>
        <View style={reviewStyles.actions}>
          <Pressable style={reviewStyles.button} onPress={onCancel} accessibilityRole="button">
            <Text style={reviewStyles.buttonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[reviewStyles.button, reviewStyles.buttonPrimary]}
            accessibilityRole="button"
            onPress={() => {
              const normalized = normalizeAzureDevOpsReviewOptions(options)
              void AsyncStorage.setItem(OPTIONS_KEY, JSON.stringify(normalized)).catch(
                () => undefined
              )
              onStart(normalized)
            }}
          >
            <Text style={reviewStyles.buttonPrimaryText}>Start review</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  field: { gap: spacing.xs },
  label: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  choiceSelected: { backgroundColor: colors.bgRaised, borderColor: colors.textSecondary },
  choiceText: { color: colors.textPrimary, fontSize: typography.metaSize },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkText: { flex: 1, gap: 2 }
})
