import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useHostClient } from '../../../src/transport/client-context'
import { useHostSystem } from '../../../src/host-system/use-host-system'
import {
  DiskCard,
  HostStatusCard,
  PowerModeCard
} from '../../../src/host-system/host-system-sections'
import { HostProcessCard } from '../../../src/host-system/host-process-card'
import { colors, spacing, typography } from '../../../src/theme/mobile-theme'

export default function HostSystemScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const router = useRouter()
  const { client, state } = useHostClient(hostId)
  const connected = state === 'connected'
  const system = useHostSystem(client, hostId, connected)
  const snapshot = system.snapshot

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
        <Text style={styles.title}>System</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {connected && system.supported === false ? (
          <Text style={styles.text}>Update Orca on this host to see its system status.</Text>
        ) : null}
        {snapshot && !system.live ? (
          <Text accessibilityRole="alert" style={styles.warning}>
            {connected ? 'Waiting for the host' : 'Host not reachable'} · last update{' '}
            {new Date(snapshot.collectedAt).toLocaleTimeString()}
          </Text>
        ) : null}
        {!snapshot && !connected ? (
          <Text style={styles.text}>Connect to this host to see its system status.</Text>
        ) : null}
        {system.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {system.error}
          </Text>
        ) : null}
        {snapshot ? (
          <>
            <HostStatusCard snapshot={snapshot} />
            <PowerModeCard
              snapshot={snapshot}
              disabled={!system.live || system.busy}
              onSelect={(mode) => void system.setPowerMode(mode)}
            />
            <DiskCard disks={snapshot.disks} />
            {snapshot.processes && system.live ? (
              <HostProcessCard
                processes={snapshot.processes}
                disabled={system.busy}
                onTerminate={system.terminateProcess}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  content: { padding: spacing.lg, gap: spacing.lg },
  text: { color: colors.textSecondary, fontSize: typography.bodySize },
  warning: { color: colors.statusAmber, fontSize: typography.bodySize },
  error: { color: colors.statusRed, fontSize: typography.bodySize }
})
