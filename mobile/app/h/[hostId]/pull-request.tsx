import { useState } from 'react'
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, ExternalLink } from 'lucide-react-native'
import { useHostClient } from '../../../src/transport/client-context'
import { useHostProtocolGates } from '../../../src/components/HostProtocolGate'
import { AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY } from '../../../../src/shared/host-feature-runtime-capabilities'
import { MobileMarkdown } from '../../../src/components/MobileMarkdown'
import {
  useAzureDevOpsReviewDetail,
  useAzureDevOpsReviewSupport
} from '../../../src/azure-devops-review/use-azure-devops-review'
import { AzureDevOpsReviewThreadsSection } from '../../../src/azure-devops-review/azure-devops-review-threads-section'
import { AzureDevOpsReviewDraftsSection } from '../../../src/azure-devops-review/azure-devops-review-drafts-section'
import { colors, radii, spacing, typography } from '../../../src/theme/mobile-theme'

type Section = 'overview' | 'threads' | 'drafts'

export default function PullRequestScreen() {
  const { hostId, key } = useLocalSearchParams<{ hostId: string; key: string }>()
  const router = useRouter()
  const { client, state } = useHostClient(hostId)
  const connected = state === 'connected'
  const supported = useAzureDevOpsReviewSupport(client, connected)
  const { detail, loading, error, reload } = useAzureDevOpsReviewDetail(
    client,
    connected && supported === true,
    key ?? ''
  )
  const pending = detail?.drafts.filter((draft) => draft.state !== 'published').length ?? 0
  const [section, setSection] = useState<Section | null>(null)
  const active: Section = section ?? (pending > 0 ? 'drafts' : 'overview')
  const pr = detail?.pullRequest
  const { hostCapabilities } = useHostProtocolGates()
  const filesSupported =
    hostCapabilities?.includes(AZURE_DEVOPS_REVIEW_MOBILE_AGENT_RUNTIME_CAPABILITY) === true
  const openFiles = (path?: string): void =>
    router.push({
      pathname: '/h/[hostId]/pull-request-files',
      params: { hostId, key: key ?? '', ...(path ? { path } : {}) }
    })

  const tabs: { id: Section; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'threads', label: `Threads (${detail?.threads.length ?? 0})` },
    { id: 'drafts', label: `Drafts (${pending})` }
  ]

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
          {pr ? `!${pr.pullRequestId} ${pr.title}` : 'Pull request'}
        </Text>
        {pr ? (
          <Pressable
            onPress={() => void Linking.openURL(pr.webUrl)}
            accessibilityRole="link"
            accessibilityLabel="Open in Azure DevOps"
            hitSlop={12}
          >
            <ExternalLink size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {pr ? (
        <Text style={styles.meta} numberOfLines={2}>
          {pr.project}/{pr.repository} · {pr.author.displayName} · {pr.sourceBranch} →{' '}
          {pr.targetBranch}
        </Text>
      ) : null}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, active === tab.id && styles.tabActive]}
            onPress={() => setSection(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === tab.id }}
          >
            <Text style={[styles.tabText, active === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textSecondary}
          />
        }
      >
        {!connected ? (
          <Text style={styles.meta}>Connect to this host to see the pull request.</Text>
        ) : supported === false ? (
          <Text style={styles.meta}>
            Update Orca on this host to review Azure DevOps pull requests.
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {detail && active === 'overview' ? (
          <View style={{ gap: spacing.md }}>
            <MobileMarkdown
              content={detail.pullRequest.description}
              fallback="No description provided."
            />
            <Text style={styles.sectionTitle}>Files ({detail.changes.length})</Text>
            {detail.changes.map((change) => (
              <Pressable
                key={change.path}
                disabled={!filesSupported}
                onPress={() => openFiles(change.path)}
                accessibilityRole="button"
              >
                <Text style={[styles.file, filesSupported && styles.fileLink]} numberOfLines={1}>
                  {change.changeType.charAt(0).toUpperCase()} {change.path}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {detail && active === 'threads' ? (
          <AzureDevOpsReviewThreadsSection client={client} detail={detail} onChanged={reload} />
        ) : null}
        {detail && active === 'drafts' ? (
          <AzureDevOpsReviewDraftsSection client={client} detail={detail} onChanged={reload} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { flex: 1, color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    paddingHorizontal: spacing.lg
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.button
  },
  tabActive: { backgroundColor: colors.bgRaised },
  tabText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '500' },
  tabTextActive: { color: colors.textPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  file: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  fileLink: { color: colors.accentBlue },
  error: { color: colors.statusRed, fontSize: typography.metaSize }
})
