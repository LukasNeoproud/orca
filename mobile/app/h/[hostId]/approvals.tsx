import { useEffect, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useHostClient } from '../../../src/transport/client-context'
import { useDeviceApprovals } from '../../../src/device-approval/use-device-approvals'
import { colors, radii, spacing, typography } from '../../../src/theme/mobile-theme'
import { loadHosts } from '../../../src/transport/host-store'

export default function DeviceApprovalsScreen() {
  const { hostId } = useLocalSearchParams<{ hostId: string }>()
  const router = useRouter()
  const { client, state } = useHostClient(hostId)
  const approvals = useDeviceApprovals(client, hostId, state === 'connected')
  const [hostName, setHostName] = useState(hostId)
  useEffect(() => {
    let stale = false
    setHostName(hostId)
    void loadHosts()
      .then((hosts) => {
        if (!stale) {
          setHostName(hosts.find((host) => host.id === hostId)?.name ?? hostId)
        }
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [hostId])
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to host"
          hitSlop={12}
        >
          <ChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Device approvals</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{hostName}</Text>
        <Text style={styles.text}>
          Approve Keychain access or a private Android build with this phone’s biometrics. Keep this
          screen open while the Mac requests approval.
        </Text>
        {Platform.OS !== 'android' ? (
          <Text style={styles.error}>
            Signing currently requires Android 11 or newer and a new native Orca build.
          </Text>
        ) : null}
        {state !== 'connected' ? (
          <Text style={styles.error}>Connect to this host to approve requests.</Text>
        ) : null}
        {approvals.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {approvals.error}
          </Text>
        ) : null}
        {approvals.notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            {approvals.notice}
          </Text>
        ) : null}
        {approvals.keyId ? (
          <View style={styles.card}>
            <Text style={styles.title}>Phone key fingerprint</Text>
            <Text selectable style={styles.fingerprint}>
              {approvals.keyId}
            </Text>
            <Text style={styles.text}>
              A local key alone does not mean the Mac has trusted it. Compare this fingerprint
              during enrollment on the Mac.
            </Text>
          </View>
        ) : null}
        {!approvals.supported ? (
          <Text style={styles.text}>
            Start device approval setup on this Mac first. Registration requires one local Touch ID
            confirmation.
          </Text>
        ) : null}
        {approvals.supported && !approvals.pending.length ? (
          <Text style={styles.text}>No pending requests.</Text>
        ) : null}
        {approvals.pending.map((entry) => {
          const disabled =
            approvals.busy ||
            state !== 'connected' ||
            Platform.OS !== 'android' ||
            ('keyId' in entry.request && approvals.keyId !== entry.request.keyId) ||
            ('kind' in entry.request && approvals.keyId !== null)
          return (
            <View key={entry.request.requestId} style={styles.card}>
              {'kind' in entry.request ? (
                <>
                  <Text style={styles.title}>Register this phone</Text>
                  <Text style={styles.text}>
                    Create a hardware-backed approval key. The Mac checks its attestation and asks
                    you to confirm its fingerprint locally.
                  </Text>
                </>
              ) : entry.request.operation.kind === 'keychain-read' ? (
                <>
                  <Text style={styles.title}>Read Keychain secrets</Text>
                  <Text style={styles.text}>
                    Approval releases these secrets to the requesting process on the Mac:
                  </Text>
                  {entry.request.requests.map((request, index) => (
                    <View
                      key={`${request.service}\u0000${request.account}`}
                      style={styles.credential}
                    >
                      <Text style={styles.text}>Secret {index + 1}</Text>
                      <Text selectable style={styles.fingerprint}>
                        Service: {request.service}
                      </Text>
                      <Text selectable style={styles.fingerprint}>
                        Account: {request.account}
                      </Text>
                    </View>
                  ))}
                  {approvals.keyId !== entry.request.keyId ? (
                    <Text style={styles.error}>This request is for another approval key.</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.title}>
                    {entry.request.operation.mode === 'publish'
                      ? 'Build and publish APK'
                      : 'Build signed APK'}
                  </Text>
                  <Text selectable style={styles.text}>
                    App: {entry.request.operation.packageName}
                  </Text>
                  <Text selectable style={styles.text}>
                    Firebase: {entry.request.operation.firebaseAppId}
                  </Text>
                  <Text selectable style={styles.fingerprint}>
                    Commit: {entry.request.operation.commit}
                  </Text>
                  <Text style={styles.text}>
                    Testers: {entry.request.operation.groups.join(', ') || 'No upload'}
                  </Text>
                  <Text selectable style={styles.fingerprint}>
                    Release notes SHA-256: {entry.request.operation.releaseNotesSha256}
                  </Text>
                  <Text style={styles.text}>
                    Allows this build to use its Android signing credentials and Firebase service
                    account.
                  </Text>
                  {approvals.keyId !== entry.request.keyId ? (
                    <Text style={styles.error}>This request is for another approval key.</Text>
                  ) : null}
                </>
              )}
              <Text style={styles.text}>
                Expires: {new Date(entry.request.expiresAt).toLocaleTimeString()}
              </Text>
              <Pressable
                style={[styles.button, disabled && styles.disabled]}
                accessibilityRole="button"
                accessibilityState={{ disabled, busy: approvals.busy }}
                disabled={disabled}
                onPress={() => void approvals.approve(entry)}
              >
                <Text style={styles.buttonText}>
                  {approvals.busy
                    ? 'Waiting…'
                    : 'kind' in entry.request
                      ? 'Register this phone'
                      : 'Approve with biometrics'}
                </Text>
              </Pressable>
            </View>
          )
        })}
        {approvals.keyId ? (
          <Pressable
            accessibilityRole="button"
            disabled={approvals.busy}
            onPress={() =>
              Alert.alert(
                'Remove approval key?',
                'This phone will no longer be able to approve requests with this key. Register again on the Mac to restore access.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove key',
                    style: 'destructive',
                    onPress: () => void approvals.resetKey()
                  }
                ]
              )
            }
          >
            <Text style={styles.error}>Remove local approval key</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  text: { color: colors.textSecondary, fontSize: typography.bodySize },
  error: { color: colors.statusRed, fontSize: typography.bodySize },
  fingerprint: {
    color: colors.textPrimary,
    fontSize: typography.metaSize,
    fontFamily: typography.monoFamily
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md
  },
  credential: { gap: spacing.xs },
  button: {
    backgroundColor: colors.surfaceBright,
    padding: spacing.md,
    borderRadius: radii.button,
    alignItems: 'center'
  },
  buttonText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' },
  disabled: { opacity: 0.5 }
})
