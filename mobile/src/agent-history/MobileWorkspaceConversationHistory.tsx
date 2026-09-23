import { ChevronDown, ChevronRight, History } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { AiVaultSession } from '../../../src/shared/ai-vault-types'
import { MobileAgentIcon } from '../components/MobileAgentIcon'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { buildMobileAgentHistoryCard } from './agent-history-session-card'

export function MobileWorkspaceConversationHistory({
  name,
  path,
  now,
  expanded,
  status,
  error,
  sessions,
  onToggle,
  onOpen,
  onRetry
}: {
  name: string
  path: string | null
  now: number
  expanded: boolean
  status: 'loading' | 'ready' | 'error' | 'offline'
  error?: string
  sessions: readonly AiVaultSession[]
  onToggle: () => void
  onOpen: (session?: AiVaultSession) => void
  onRetry: () => void
}) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Pressable
          style={styles.toggle}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} conversation history for ${name}`}
        >
          {expanded ? (
            <ChevronDown size={13} color={colors.textSecondary} />
          ) : (
            <ChevronRight size={13} color={colors.textSecondary} />
          )}
          <Text style={styles.label}>Conversation History</Text>
        </Pressable>
        <Pressable
          onPress={() => onOpen()}
          style={styles.fullButton}
          accessibilityRole="button"
          accessibilityLabel={`Show full history for ${name}`}
        >
          <History size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
      {expanded ? (
        status === 'loading' ? (
          <Text style={styles.message}>Loading conversations…</Text>
        ) : status === 'offline' ? (
          <Text style={styles.message}>
            Connect this workspace host to load conversation history.
          </Text>
        ) : status === 'error' ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry conversation history"
          >
            <Text style={styles.message}>{error || 'Unable to load conversations'} · Retry</Text>
          </Pressable>
        ) : sessions.length === 0 ? (
          <Text style={styles.message}>No conversations in this workspace.</Text>
        ) : (
          sessions.map((session) => {
            const card = buildMobileAgentHistoryCard(session, path, now)
            return (
              <Pressable
                key={session.id}
                style={styles.session}
                onPress={() => onOpen(session)}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation ${card.title}`}
              >
                <MobileAgentIcon agentId={session.agent} size={14} />
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {card.title}
                </Text>
                {card.timeAgo ? <Text style={styles.sessionTime}>{card.timeAgo}</Text> : null}
              </Pressable>
            )
          })
        )
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginLeft: spacing.lg + 20 + spacing.sm,
    marginRight: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingBottom: spacing.xs
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs
  },
  label: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  fullButton: { padding: spacing.xs },
  message: { color: colors.textMuted, fontSize: typography.metaSize, paddingVertical: spacing.xs },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  sessionTitle: { color: colors.textPrimary, fontSize: typography.metaSize, flex: 1 },
  sessionTime: { color: colors.textMuted, fontSize: typography.metaSize }
})
