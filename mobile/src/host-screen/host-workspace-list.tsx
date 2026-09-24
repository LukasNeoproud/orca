import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native'
import { ChevronDown, ChevronRight, Pin } from 'lucide-react-native'
import { AuthFailedBanner } from '../components/AuthFailedBanner'
import { HostDiagnosticsLink } from '../components/HostDiagnosticsLink'
import { HostRouteNoticeBanner } from '../components/HostRouteNoticeBanner'
import { MobileRepoIcon } from '../components/MobileRepoIcon'
import { MobileSearchField } from '../components/MobileSearchField'
import { NewWorkspaceFab, FAB_SIZE } from '../components/NewWorkspaceFab'
import { WorktreeListRow } from '../components/WorktreeListRow'
import { MOBILE_AI_VAULT_CAPABILITY } from '../agent-history/agent-history-capability'
import {
  mobileWorkspaceExecutionHostId,
  mobileWorkspaceHistoryIdentity
} from '../agent-history/mobile-workspace-conversation-history'
import { useMobileWorkspaceConversationCatalog } from '../agent-history/use-mobile-workspace-conversation-catalog'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import type { ExecutionHostId } from '../../../src/shared/execution-host'
import type { Worktree } from '../worktree/workspace-list-types'
import { colors, spacing } from '../theme/mobile-theme'
import { getWorktreeRowIdentity } from '../worktree/worktree-host-row-identity'
import { HostWorkspaceListStates } from '../worktree/host-workspace-list-states'
import { getWorktreeStatus } from '../worktree/workspace-list-sections'
import { repoColor } from '../worktree/repo-color'
import { hostScreenStyles as styles } from './host-screen-styles'
import { HostIndependentTerminalsEntry } from './HostIndependentTerminalsEntry'
import type { HostScreenController } from './use-host-screen-controller'

export function HostWorkspaceList({ controller }: { controller: HostScreenController }) {
  const {
    actions,
    activeWorktreeScroll,
    catalog,
    client,
    connState,
    contentMaxWidth,
    displayWorktrees,
    embedded,
    floatingWorkspaceEnabled,
    forceReconnectHost,
    hostId,
    hostCapabilities,
    insets,
    isReadOnly,
    isWideLayout,
    noticeParam,
    now,
    reconnectAttempts,
    relayRecovery,
    routeNotice,
    router,
    sectionsResult,
    setDismissedNotice,
    settings,
    state
  } = controller
  const { rawSections, sections, uniqueRepoColors } = sectionsResult
  const [expandedHistory, setExpandedHistory] = useState<ReadonlySet<string>>(new Set())
  const requestedHostIds = useMemo(() => {
    const hosts = new Set<ExecutionHostId>()
    for (const item of displayWorktrees) {
      if (expandedHistory.has(mobileWorkspaceHistoryIdentity(item))) {
        hosts.add(mobileWorkspaceExecutionHostId(item))
      }
    }
    return [...hosts]
  }, [displayWorktrees, expandedHistory])
  const historyAvailable = hostCapabilities.includes(MOBILE_AI_VAULT_CAPABILITY)
  const history = useMobileWorkspaceConversationCatalog({
    client,
    connState,
    enabled: historyAvailable,
    requestedHostIds,
    worktrees: displayWorktrees
  })
  const toggleHistory = (item: Worktree) => {
    const identity = mobileWorkspaceHistoryIdentity(item)
    setExpandedHistory((current) => {
      const next = new Set(current)
      if (next.has(identity)) {
        next.delete(identity)
      } else {
        next.add(identity)
      }
      return next
    })
  }
  const openHistory = (item: Worktree, session?: AiVaultSession) => {
    if (!hostId) {
      return
    }
    const params = new URLSearchParams({
      name: item.displayName || item.repo,
      executionHostId: mobileWorkspaceExecutionHostId(item)
    })
    if (session) {
      params.set('session', session.id)
    }
    actions.navigateFromHostList(
      `/h/${encodeURIComponent(hostId)}/agent-history/${encodeURIComponent(item.worktreeId)}?${params.toString()}`
    )
  }

  return (
    <>
      {/* Auth failed: a latched relay rejection must reach the same re-pair affordance. */}
      {(connState === 'auth-failed' || relayRecovery.pairingRejected) && (
        <AuthFailedBanner
          canRetry={!!hostId}
          onRetry={() => hostId && void forceReconnectHost(hostId)}
          onRepair={() => router.push('/pair-scan')}
          onRemove={() => state.setConfirmRemoveHost(true)}
        />
      )}

      {connState !== 'connected' &&
      !relayRecovery.pairingRejected &&
      reconnectAttempts >= 3 &&
      hostId ? (
        <HostDiagnosticsLink
          onPress={() =>
            router.push({ pathname: '/connection-log', params: { hostId: String(hostId) } })
          }
        />
      ) : null}

      {/* Why a bounced route landed here (e.g. the workspace was deleted on the desktop). */}
      {routeNotice && (
        <HostRouteNoticeBanner
          message={routeNotice}
          onDismiss={() => setDismissedNotice(noticeParam ?? null)}
        />
      )}

      {/* Search bar */}
      {state.showSearch && (
        <View style={styles.searchBar}>
          <MobileSearchField
            value={state.search}
            onChangeText={state.setSearch}
            placeholder="Search worktrees…"
            autoFocus
            // Why: new key per open remounts the focus effect across rapid toggles so the keyboard reappears.
            focusKey={state.showSearch}
            accessibilityLabel="Search worktrees"
          />
        </View>
      )}

      <HostIndependentTerminalsEntry
        connected={connState === 'connected'}
        enabled={floatingWorkspaceEnabled}
        onPress={actions.openFloatingWorkspace}
      />

      <HostWorkspaceListStates
        connState={connState}
        worktreesLoaded={state.worktreesLoaded}
        displayCount={displayWorktrees.length}
        sectionCount={sections.length}
        catalogError={state.catalogError}
        search={state.search}
        activeFilterCount={settings.activeFilterCount}
      />

      {sections.length > 0 && (
        <SectionList
          ref={activeWorktreeScroll.sectionListRef}
          sections={sections}
          keyExtractor={(w) => w.sectionListKey ?? getWorktreeRowIdentity(w)}
          stickySectionHeadersEnabled={false}
          // Why: keep the search IME up while tapping clear / scrolling results.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollToIndexFailed={activeWorktreeScroll.onScrollToIndexFailed}
          // Why: edge-to-edge under the system nav bar; insets.bottom keeps the last row above it.
          contentContainerStyle={[
            styles.list,
            // Reserve room so the last row stays tappable above the phone's floating "+" (embedded uses the toolbar +).
            { paddingBottom: (embedded ? spacing.lg : FAB_SIZE + spacing.xl) + insets.bottom },
            isWideLayout &&
              !embedded && { maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center' }
          ]}
          renderSectionHeader={({ section }) => {
            if (!section.title) {
              return null
            }
            const isCollapsed = state.collapsedGroups.has(section.key)
            const rawSection = rawSections.find((s) => s.key === section.key)
            const count = rawSection?.data.length ?? 0
            const repoSectionColor =
              state.groupMode === 'repo' ? uniqueRepoColors.get(section.title) : null
            const repoSectionIcon =
              state.groupMode === 'repo' ? state.repoIconsByName.get(section.title) : null
            return (
              <Pressable
                style={styles.sectionHeader}
                onPress={() => settings.toggleCollapsed(section.key)}
              >
                {isCollapsed ? (
                  <ChevronRight size={12} color={colors.textMuted} style={styles.sectionIcon} />
                ) : (
                  <ChevronDown size={12} color={colors.textMuted} style={styles.sectionIcon} />
                )}
                {section.icon === 'pin' && (
                  <Pin size={12} color={colors.textMuted} style={styles.sectionIcon} />
                )}
                {state.groupMode === 'repo' ? (
                  <View style={styles.sectionRepoIcon}>
                    <MobileRepoIcon
                      repoIcon={repoSectionIcon}
                      size={14}
                      color={repoSectionColor ?? colors.textSecondary}
                    />
                  </View>
                ) : null}
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{count}</Text>
              </Pressable>
            )
          }}
          ItemSeparatorComponent={ListSeparator}
          // Why (#8498): manual pull-to-refresh forces a fresh snapshot after a stale-cache reconnect.
          refreshControl={
            <RefreshControl
              refreshing={catalog.refreshing}
              onRefresh={catalog.onRefresh}
              tintColor={colors.textSecondary}
              colors={[colors.textSecondary]}
            />
          }
          renderItem={({ item }) => (
            <WorktreeListRow
              item={item}
              isReadOnly={isReadOnly}
              now={now}
              status={getWorktreeStatus(item)}
              repoColor={uniqueRepoColors.get(item.repo) ?? repoColor(item.repo)}
              repoIcon={state.repoIconsByName.get(item.repo) ?? null}
              hideRepo={state.groupMode === 'repo'}
              onPress={actions.openWorktreeSession}
              onLongPress={
                item.workspaceKind === 'folder-workspace' ? undefined : state.setActionTarget
              }
              onToggleLineage={settings.toggleWorktreeLineage}
              historyAvailable={historyAvailable}
              historyExpanded={expandedHistory.has(mobileWorkspaceHistoryIdentity(item))}
              historyStatus={
                connState !== 'connected'
                  ? 'offline'
                  : (history.catalogs.get(mobileWorkspaceExecutionHostId(item))?.status ??
                    'loading')
              }
              historyError={
                history.catalogs.get(mobileWorkspaceExecutionHostId(item))?.error ?? undefined
              }
              historySessions={history.sessionsByWorkspace.get(
                mobileWorkspaceHistoryIdentity(item)
              )}
              onToggleHistory={toggleHistory}
              onOpenHistory={openHistory}
              onRetryHistory={(row) => void history.retry(mobileWorkspaceExecutionHostId(row))}
            />
          )}
        />
      )}

      {/* Floating "new workspace" button — phone only; embedded sidebars keep the toolbar +. */}
      {!embedded && (
        <NewWorkspaceFab
          onPress={actions.openNewWorktreeModal}
          disabled={connState !== 'connected'}
        />
      )}
    </>
  )
}

function ListSeparator() {
  return <View style={styles.separator} />
}
