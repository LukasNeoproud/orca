import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CornerDownRight, SquareTerminal } from 'lucide-react-native'
import type { ConversationBranchRecord } from '../../../src/shared/conversation-branch'
import { conversationBranchFamily } from '../../../src/shared/conversation-branch-family'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { DrawerFrame, ErrorText } from './MobileConversationBranchDrawers'

/** The conversation's family: the original, the replies branches started after, the branches. */
export function MobileBranchFamilyDrawer({
  branches,
  providerSessionId,
  error,
  onOpen,
  onClose
}: {
  branches: readonly ConversationBranchRecord[]
  providerSessionId: string
  error: string | null
  onOpen: (providerSessionId: string) => void
  onClose: () => void
}): React.JSX.Element {
  const family = conversationBranchFamily(branches, providerSessionId)
  const member = (id: string, label: string, detail?: string, terminal = false): ReactNode => {
    const current = id === providerSessionId
    return (
      <Pressable
        key={id}
        style={({ pressed }) => [styles.member, pressed && styles.pressed]}
        // A terminal branch runs on the computer; the phone does not open a second copy of it.
        disabled={current || terminal}
        onPress={() => onOpen(id)}
        accessibilityRole="button"
        accessibilityState={{ selected: current, disabled: current || terminal }}
      >
        {terminal ? <SquareTerminal size={14} color={colors.textMuted} /> : null}
        <View style={styles.memberText}>
          <Text style={[styles.memberLabel, current && styles.current]} numberOfLines={1}>
            {label}
          </Text>
          {detail ? (
            <Text style={styles.memberDetail} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    )
  }
  return (
    <DrawerFrame title="Conversation family" onClose={onClose}>
      <ScrollView style={styles.familyList}>
        {member(family.rootProviderSessionId, 'Original conversation')}
        {family.points.map((point) => (
          <View key={point.key} style={{ marginLeft: point.depth * spacing.md }}>
            <View style={styles.point}>
              <CornerDownRight size={14} color={colors.textMuted} />
              <Text style={styles.pointText} numberOfLines={1}>
                {point.excerpt}
              </Text>
            </View>
            <View style={styles.pointBranches}>
              {point.branches.map((branch) =>
                branch.child.providerSessionId
                  ? member(
                      branch.child.providerSessionId,
                      branch.label,
                      branch.child.surface === 'terminal' ? 'Terminal' : undefined,
                      branch.child.surface === 'terminal'
                    )
                  : null
              )}
            </View>
          </View>
        ))}
      </ScrollView>
      <ErrorText error={error} />
    </DrawerFrame>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  familyList: { marginBottom: spacing.sm },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.row
  },
  memberText: { flex: 1 },
  memberLabel: { color: colors.textPrimary, fontSize: typography.bodySize },
  memberDetail: { color: colors.textMuted, fontSize: typography.metaSize },
  current: { fontWeight: '700' },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm
  },
  pointText: { flex: 1, color: colors.textMuted, fontSize: typography.metaSize },
  pointBranches: {
    marginLeft: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.borderSubtle
  }
})
