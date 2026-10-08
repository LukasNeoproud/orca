import { useMemo } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, CircleDashed, MessageSquareDashed } from 'lucide-react-native'
import { useHostClient } from '../../../src/transport/client-context'
import { MobileSearchField } from '../../../src/components/MobileSearchField'
import {
  useAzureDevOpsReviewFilters,
  useAzureDevOpsReviewList,
  useAzureDevOpsReviewSupport
} from '../../../src/azure-devops-review/use-azure-devops-review'
import { AzureDevOpsReviewFilterBar } from '../../../src/azure-devops-review/azure-devops-review-filter-bar'
import { filterAzureDevOpsReviewPullRequests } from '../../../../src/shared/azure-devops-review-filters'
import { colors, radii, spacing, typography } from '../../../src/theme/mobile-theme'

export default function PullRequestsScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const router = useRouter()
  const { client, state } = useHostClient(hostId)
  const connected = state === 'connected'
  const supported = useAzureDevOpsReviewSupport(client, connected)
  const [filters, setFilters] = useAzureDevOpsReviewFilters()
  const list = useAzureDevOpsReviewList(client, connected && supported === true, filters.status)
  const pullRequests = useMemo(
    () => filterAzureDevOpsReviewPullRequests(list.result?.pullRequests ?? [], filters),
    [list.result, filters]
  )
  const multipleOrgs = new Set(list.result?.repos.map((repo) => repo.organizationKey)).size > 1

  const empty = (() => {
    if (!connected) {
      return 'Connect to this host to see its pull requests.'
    }
    if (supported === false) {
      return 'Update Orca on this host to review Azure DevOps pull requests.'
    }
    if (!list.result) {
      return list.loading ? 'Loading pull requests…' : ''
    }
    if (list.result.repos.length === 0) {
      return 'Add a project whose origin is an Azure Repos repository on the desktop.'
    }
    return list.result.pullRequests.length === 0
      ? 'No pull requests are waiting for your review.'
      : 'No pull requests match the filters.'
  })()

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Pull requests</Text>
      </View>
      <View style={styles.controls}>
        <View style={styles.search}>
          <MobileSearchField
            value={filters.query}
            onChangeText={(query) => setFilters({ query })}
            placeholder="Search ID, title or author"
            showClear={filters.query.length > 0}
            onClear={() => setFilters({ query: '' })}
          />
        </View>
        <AzureDevOpsReviewFilterBar
          filters={filters}
          repos={list.result?.repos ?? []}
          onChange={setFilters}
        />
      </View>
      {list.error ? <Text style={styles.error}>{list.error}</Text> : null}
      {list.result?.errors.map((entry) => (
        <Text key={`${entry.scope}:${entry.message}`} style={styles.warning}>
          {entry.scope}: {entry.message}
        </Text>
      ))}
      <FlatList
        data={pullRequests}
        keyExtractor={(pr) => pr.key}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={list.loading}
            onRefresh={() => void list.refresh()}
            tintColor={colors.textSecondary}
          />
        }
        ListEmptyComponent={empty ? <Text style={styles.empty}>{empty}</Text> : null}
        renderItem={({ item: pr }) => {
          const drafts = list.result?.draftCounts[pr.key] ?? 0
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() =>
                router.push({
                  pathname: '/h/[hostId]/pull-request',
                  params: { hostId, key: pr.key }
                })
              }
              accessibilityRole="button"
            >
              <View style={styles.rowTitleLine}>
                {pr.isDraft ? <CircleDashed size={14} color={colors.textMuted} /> : null}
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {pr.title}
                </Text>
                {drafts > 0 ? (
                  <View style={styles.drafts}>
                    <MessageSquareDashed size={12} color={colors.textSecondary} />
                    <Text style={styles.meta}>{drafts}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {multipleOrgs ? `${pr.organizationLabel}/` : ''}
                {pr.repository} · !{pr.pullRequestId} · {pr.author.displayName}
              </Text>
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  controls: { gap: spacing.sm, paddingBottom: spacing.sm },
  search: { paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.bgPanel
  },
  rowPressed: { backgroundColor: colors.bgRaised },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '500'
  },
  drafts: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  meta: { color: colors.textSecondary, fontSize: typography.metaSize },
  empty: { color: colors.textSecondary, fontSize: typography.bodySize, textAlign: 'center' },
  error: { color: colors.statusRed, fontSize: typography.metaSize, paddingHorizontal: spacing.lg },
  warning: {
    color: colors.statusAmber,
    fontSize: typography.metaSize,
    paddingHorizontal: spacing.lg
  }
})
