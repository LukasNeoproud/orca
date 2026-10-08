import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { Check, ChevronDown, Circle } from 'lucide-react-native'
import { ActionSheetModal, type ActionSheetAction } from '../components/ActionSheetModal'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import {
  AZURE_DEVOPS_REVIEW_ALL,
  azureDevOpsReviewFilterOptions,
  type AzureDevOpsReviewFilterOption,
  type AzureDevOpsReviewFilters
} from '../../../src/shared/azure-devops-review-filters'
import type { AzureDevOpsReviewRepo } from '../../../src/shared/azure-devops-review-types'

type Sheet = 'project' | 'repo' | 'status' | null

const STATUS_OPTIONS: AzureDevOpsReviewFilterOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
  { value: 'all', label: 'All states' }
]

function labelFor(options: AzureDevOpsReviewFilterOption[], value: string, allLabel: string) {
  return value === AZURE_DEVOPS_REVIEW_ALL && allLabel
    ? allLabel
    : (options.find((option) => option.value === value)?.label ?? allLabel)
}

export function AzureDevOpsReviewFilterBar({
  filters,
  repos,
  onChange
}: {
  filters: AzureDevOpsReviewFilters
  repos: readonly AzureDevOpsReviewRepo[]
  onChange: (patch: Partial<AzureDevOpsReviewFilters>) => void
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const options = useMemo(
    () => azureDevOpsReviewFilterOptions(repos, filters.project),
    [repos, filters.project]
  )
  const chips: { key: Exclude<Sheet, null>; label: string }[] = [
    { key: 'project', label: labelFor(options.projects, filters.project, 'All projects') },
    { key: 'repo', label: labelFor(options.repos, filters.repo, 'All repos') },
    { key: 'status', label: labelFor(STATUS_OPTIONS, filters.status, '') }
  ]

  const sheetActions = (): ActionSheetAction[] => {
    const pick = (value: string, current: string, apply: () => void, label: string) => ({
      label,
      icon: value === current ? Check : Circle,
      onPress: apply
    })
    if (sheet === 'project') {
      return [{ value: AZURE_DEVOPS_REVIEW_ALL, label: 'All projects' }, ...options.projects].map(
        (option) =>
          pick(
            option.value,
            filters.project,
            () => onChange({ project: option.value, repo: AZURE_DEVOPS_REVIEW_ALL }),
            option.label
          )
      )
    }
    if (sheet === 'repo') {
      return [{ value: AZURE_DEVOPS_REVIEW_ALL, label: 'All repos' }, ...options.repos].map(
        (option) =>
          pick(option.value, filters.repo, () => onChange({ repo: option.value }), option.label)
      )
    }
    return STATUS_OPTIONS.map((option) =>
      pick(
        option.value,
        filters.status,
        () => onChange({ status: option.value as AzureDevOpsReviewFilters['status'] }),
        option.label
      )
    )
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            style={styles.chip}
            onPress={() => setSheet(chip.key)}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${chip.key}: ${chip.label}`}
          >
            <Text style={styles.chipText} numberOfLines={1}>
              {chip.label}
            </Text>
            <ChevronDown size={14} color={colors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
      <ActionSheetModal
        visible={sheet !== null}
        title={sheet === 'project' ? 'Project' : sheet === 'repo' ? 'Repository' : 'Status'}
        actions={sheet ? sheetActions() : []}
        onClose={() => setSheet(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    maxWidth: 200
  },
  chipText: { color: colors.textPrimary, fontSize: typography.metaSize }
})
