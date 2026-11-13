import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Hammer, Square, SquareCheck } from 'lucide-react-native'
import { getPrimaryDeviceAbi } from '@orca/expo-apk-installer'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileApkBuild } from './mobile-apk-builds'
import { buildApkOnHost, listHostBuildVariants, probeHostApkBuild } from './mobile-apk-host-build'
import { styles } from './mobile-apk-host-build-styles'

type Props = {
  visible: boolean
  client: RpcClient | null
  worktreeId: string
  /** Another transfer is running, so a new build must wait. */
  busy: boolean
  /** The desktop finished a build; the caller downloads and installs it. */
  onBuilt: (build: MobileApkBuild) => void
}

/** Builds the workspace's Android project on the desktop; hidden when the desktop cannot. */
export function MobileApkHostBuildSection({ visible, client, worktreeId, busy, onBuilt }: Props) {
  const [supported, setSupported] = useState(false)
  const [variants, setVariants] = useState<string[]>([])
  const [variant, setVariant] = useState<string | null>(null)
  const [loadingVariants, setLoadingVariants] = useState(false)
  // Default on: a single-ABI APK is a fraction of the universal one to send to the phone.
  const [phoneAbiOnly, setPhoneAbiOnly] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const deviceAbi = getPrimaryDeviceAbi()

  useEffect(() => {
    if (!visible || !client) {
      controllerRef.current?.abort()
      return
    }
    let active = true
    setError(null)
    void (async () => {
      try {
        const probe = await probeHostApkBuild(client, worktreeId)
        if (!active) {
          return
        }
        setSupported(probe.supported)
        if (!probe.supported) {
          return
        }
        // The saved variant is usable at once; Gradle can take minutes to list the rest.
        setVariant((current) => current ?? probe.savedVariant ?? null)
        setVariants((current) =>
          current.length > 0 ? current : probe.savedVariant ? [probe.savedVariant] : []
        )
        setLoadingVariants(true)
        const listed = await listHostBuildVariants(client, worktreeId)
        if (active) {
          setVariants(listed)
          setVariant(
            (current) => current ?? listed.find((name) => /debug$/i.test(name)) ?? listed[0] ?? null
          )
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not read build variants')
        }
      } finally {
        if (active) {
          setLoadingVariants(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [visible, client, worktreeId])

  if (!supported || !client) {
    return null
  }

  const build = async () => {
    if (!variant || controllerRef.current) {
      return
    }
    const controller = new AbortController()
    controllerRef.current = controller
    setBuilding(true)
    setError(null)
    try {
      const built = await buildApkOnHost(client, worktreeId, variant, {
        abi: phoneAbiOnly ? deviceAbi : null,
        signal: controller.signal
      })
      if (!controller.signal.aborted) {
        onBuilt(built)
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Build failed')
      }
    } finally {
      controllerRef.current = null
      setBuilding(false)
    }
  }
  const AbiIcon = phoneAbiOnly ? SquareCheck : Square

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Build on desktop</Text>
      <View style={styles.variants}>
        {variants.map((name) => {
          const selected = name === variant
          return (
            <Pressable
              key={name}
              style={[styles.variant, selected && styles.variantSelected]}
              onPress={() => setVariant(name)}
              disabled={building}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Build variant ${name}`}
            >
              <Text style={[styles.variantText, selected && styles.variantTextSelected]}>
                {name}
              </Text>
            </Pressable>
          )
        })}
        {loadingVariants ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
      </View>
      {deviceAbi ? (
        <Pressable
          style={styles.abiRow}
          onPress={() => setPhoneAbiOnly((value) => !value)}
          disabled={building}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: phoneAbiOnly }}
          accessibilityLabel="Build only for this phone"
        >
          <AbiIcon size={18} color={colors.textSecondary} />
          <Text style={styles.abiText}>Only this phone’s ABI ({deviceAbi}) — smaller download</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.buildButton, (!variant || busy) && !building && styles.disabled]}
        onPress={() => (building ? controllerRef.current?.abort() : void build())}
        disabled={!building && (!variant || busy)}
        accessibilityRole="button"
        accessibilityLabel={building ? 'Cancel build' : 'Build and install'}
      >
        {building ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <Hammer size={15} color={colors.textPrimary} />
        )}
        <Text style={styles.buildButtonText}>
          {building ? 'Building on desktop… Tap to cancel' : 'Build and install'}
        </Text>
      </Pressable>
    </View>
  )
}
