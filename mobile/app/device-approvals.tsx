import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react-native'
import { loadHostCatalog } from '../src/transport/host-store'
import type { HostCatalogEntry } from '../src/transport/types'
import { colors, radii, spacing, typography } from '../src/theme/mobile-theme'

export default function DeviceApprovalsHostsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [hosts, setHosts] = useState<HostCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let active = true
      setLoading(true)
      setError(false)
      setHosts([])
      void loadHostCatalog()
        .then((catalog) => {
          if (active) {
            setHosts(catalog)
            setLoading(false)
          }
        })
        .catch(() => {
          if (active) {
            setError(true)
            setLoading(false)
          }
        })
      return () => {
        active = false
      }
    }, [])
  )

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.heading}>Device approvals</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}>
        <Text style={styles.intro}>
          Choose a paired host. Device approvals are currently available only on macOS hosts.
        </Text>
        {loading ? <Text style={styles.message}>Loading paired hosts…</Text> : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.message}>
            Could not load paired hosts. Return to this screen to try again.
          </Text>
        ) : null}
        {!loading && !error && hosts.length === 0 ? (
          <Text style={styles.message}>Pair a macOS host with Orca first, then return here.</Text>
        ) : null}
        {hosts.length > 0 ? (
          <View style={styles.section}>
            {hosts.map((host, index) => {
              const available = host.credentialStatus === 'ready'
              return (
                <View key={host.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${host.name} device approvals`}
                    accessibilityState={{ disabled: !available }}
                    disabled={!available}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => router.push(`/h/${host.id}/approvals`)}
                  >
                    <ShieldCheck size={16} color={colors.textSecondary} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowLabel}>{host.name}</Text>
                      {!available ? (
                        <Text style={styles.rowHint}>
                          {host.credentialStatus === 'missing'
                            ? 'Pair this host again from Hosts'
                            : 'Pairing credentials temporarily unavailable'}
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              )
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm
  },
  heading: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  intro: {
    color: colors.textSecondary,
    fontSize: typography.bodySize,
    marginBottom: spacing.lg
  },
  message: { color: colors.textSecondary, fontSize: typography.bodySize },
  section: { backgroundColor: colors.bgPanel, borderRadius: radii.card, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg
  },
  rowPressed: { backgroundColor: colors.bgRaised },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowLabel: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '500' },
  rowHint: { color: colors.textMuted, fontSize: typography.metaSize },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md
  }
})
