import { useEffect, useRef } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useHostClient } from '../transport/client-context'
import { useHostProtocolGates } from '../components/HostProtocolGate'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import type { AzureDevOpsReviewChange } from '../../../src/shared/azure-devops-review-types'
import { useAzureDevOpsReviewDetail } from './use-azure-devops-review'
import { AzureDevOpsReviewFileDiff } from './AzureDevOpsReviewFileDiff'

const CHANGE_LABEL: Record<AzureDevOpsReviewChange['changeType'], string> = {
  add: 'Added',
  edit: 'Edited',
  delete: 'Deleted',
  rename: 'Renamed',
  other: 'Changed'
}

/** Every changed file of a pull request in one scroll, as Azure DevOps shows them by default. */
export function AzureDevOpsReviewFilesScreen({
  hostId,
  pullRequestKey,
  initialPath
}: {
  hostId: string
  pullRequestKey: string
  initialPath: string | null
}) {
  const router = useRouter()
  const { client, state } = useHostClient(hostId)
  const { hostCapabilities } = useHostProtocolGates()
  const supported =
    hostCapabilities?.includes(AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY) === true
  const connected = state === 'connected'
  const { detail, loading, error, reload } = useAzureDevOpsReviewDetail(
    client,
    connected && supported,
    pullRequestKey
  )
  const listRef = useRef<FlatList<AzureDevOpsReviewChange>>(null)
  const scrolledRef = useRef(false)
  const changes = detail?.changes ?? []
  const initialIndex = initialPath ? changes.findIndex((change) => change.path === initialPath) : -1

  useEffect(() => {
    if (scrolledRef.current || initialIndex <= 0) {
      return
    }
    scrolledRef.current = true
    listRef.current?.scrollToIndex({ index: initialIndex, animated: false })
  }, [initialIndex])

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
        <Text style={styles.title} numberOfLines={1}>
          {detail ? `Files (${changes.length})` : 'Files'}
        </Text>
      </View>
      {!supported ? (
        <Text style={styles.note}>Update Orca on this computer to see file changes here.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        ref={listRef}
        data={detail ? changes : []}
        keyExtractor={(change) => change.path}
        contentContainerStyle={styles.content}
        initialNumToRender={3}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textSecondary}
          />
        }
        // Why: rows above the target have unknown heights until they render.
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 250)
        }}
        renderItem={({ item: change }) => (
          <View style={styles.file}>
            <Text style={styles.path} numberOfLines={2}>
              {change.changeType === 'rename' && change.originalPath
                ? `${change.originalPath} → ${change.path}`
                : change.path}
            </Text>
            <Text style={styles.note}>{CHANGE_LABEL[change.changeType]}</Text>
            {detail ? (
              <AzureDevOpsReviewFileDiff
                client={client}
                detail={detail}
                change={change}
                onChanged={reload}
              />
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { flex: 1, color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },
  file: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  path: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily,
    fontWeight: '600'
  },
  note: { color: colors.textSecondary, fontSize: typography.metaSize, paddingHorizontal: 0 },
  error: { color: colors.statusRed, fontSize: typography.metaSize, paddingHorizontal: spacing.lg }
})
