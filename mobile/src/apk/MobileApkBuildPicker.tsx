import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, Text, TextInput, View } from 'react-native'
import { FileDown, RefreshCw } from 'lucide-react-native'
import { BottomDrawer } from '../components/BottomDrawer'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import { listMobileApkBuilds, type MobileApkBuild } from './mobile-apk-builds'
import { installMobileApkBuild } from './mobile-apk-transfer'
import { styles } from './mobile-apk-build-picker-styles'

const REFRESH_INTERVAL_MS = 5_000

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  visible: boolean
  client: RpcClient | null
  worktreeId: string
  onClose: () => void
}

export function MobileApkBuildPicker({ visible, client, worktreeId, onClose }: Props) {
  const [pathDraft, setPathDraft] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [builds, setBuilds] = useState<MobileApkBuild[]>([])
  const [selectedBuild, setSelectedBuild] = useState<MobileApkBuild | null>(null)
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState(false)
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')
  const installControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active')
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!visible || !client || !appActive) {
      setLoading(false)
      return
    }
    let active = true
    let inFlight = false
    const load = async () => {
      if (inFlight) {
        return
      }
      inFlight = true
      setLoading(true)
      try {
        const next = await listMobileApkBuilds(client, worktreeId, rootPath || undefined)
        if (active) {
          setBuilds(next)
          setSelectedBuild((current) =>
            current &&
            next.some(
              (build) =>
                build.relativePath === current.relativePath &&
                build.size === current.size &&
                build.mtime === current.mtime
            )
              ? current
              : null
          )
          setError(null)
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not find APK builds')
        }
      } finally {
        inFlight = false
        if (active) {
          setLoading(false)
        }
      }
    }
    void load()
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [visible, client, worktreeId, rootPath, refreshKey, appActive])

  useEffect(() => {
    if (!visible) {
      installControllerRef.current?.abort()
    } else {
      setInstalled(false)
    }
  }, [visible])

  const availableSelection = builds.find(
    (build) =>
      build.relativePath === selectedBuild?.relativePath &&
      build.size === selectedBuild.size &&
      build.mtime === selectedBuild.mtime
  )
  const refresh = () => setRefreshKey((value) => value + 1)
  const search = () => {
    setBuilds([])
    setSelectedBuild(null)
    setError(null)
    setRootPath(pathDraft.trim())
    refresh()
  }
  const install = async () => {
    if (!client || !availableSelection || installControllerRef.current) {
      return
    }
    const controller = new AbortController()
    installControllerRef.current = controller
    setInstalling(true)
    setProgress(0)
    setError(null)
    setInstalled(false)
    try {
      await installMobileApkBuild(
        client,
        worktreeId,
        availableSelection,
        (fraction) => {
          if (!controller.signal.aborted) {
            setProgress(Math.max(0, Math.min(1, fraction)))
          }
        },
        controller.signal
      )
      if (!controller.signal.aborted) {
        setInstalled(true)
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Could not install APK')
      }
    } finally {
      if (installControllerRef.current === controller) {
        installControllerRef.current = null
        setInstalling(false)
      }
    }
  }
  const dismiss = () => {
    installControllerRef.current?.abort()
    onClose()
  }

  return (
    <BottomDrawer visible={visible} onClose={dismiss}>
      <View style={styles.header}>
        <Text style={styles.title}>Install APK</Text>
        <Text style={styles.description}>
          Choose a completed build from this workspace. New builds appear automatically.
        </Text>
      </View>
      <View style={styles.pathSection}>
        <Text style={styles.label}>Build search path</Text>
        <TextInput
          style={styles.input}
          value={pathDraft}
          onChangeText={setPathDraft}
          onSubmitEditing={search}
          placeholder="Automatic build directories"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Build search path"
        />
        <Text style={styles.pathHint}>Leave blank to search common Gradle output directories.</Text>
        <View style={styles.controls}>
          <Pressable style={styles.secondaryButton} onPress={search} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Search path</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={refresh}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Refresh APK builds"
          >
            <RefreshCw size={15} color={colors.textSecondary} />
            <Text style={styles.secondaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </View>
      {!client ? (
        <Text style={styles.message}>Connect to the paired Orca host to find APKs.</Text>
      ) : null}
      {client && loading && builds.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.message}>Looking for APK builds…</Text>
        </View>
      ) : null}
      {client && !loading && builds.length === 0 && !error ? (
        <Text style={styles.message}>No completed APK builds found yet.</Text>
      ) : null}
      {builds.length > 0 ? (
        <View style={styles.buildList}>
          {builds.map((build) => {
            const selected = build === availableSelection
            return (
              <Pressable
                key={build.relativePath}
                style={[styles.buildRow, selected && styles.buildRowSelected]}
                onPress={() => setSelectedBuild(build)}
                disabled={installing}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={build.relativePath}
              >
                <FileDown size={18} color={colors.textSecondary} />
                <View style={styles.buildText}>
                  <Text style={styles.buildName} numberOfLines={1}>
                    {build.relativePath.split(/[\\/]/).at(-1)}
                  </Text>
                  <Text style={styles.buildDetail} numberOfLines={2}>
                    {build.relativePath} · {formatSize(build.size)}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {installed ? <Text style={styles.message}>Installation completed.</Text> : null}
      <View style={styles.footer}>
        <Pressable style={styles.dismissButton} onPress={dismiss} accessibilityRole="button">
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
        <Pressable
          style={[
            styles.installButton,
            (!availableSelection || installing || installed || !client) && styles.disabled
          ]}
          onPress={() => void install()}
          disabled={!availableSelection || installing || installed || !client}
          accessibilityRole="button"
          accessibilityLabel="Install selected APK"
        >
          {installing ? <ActivityIndicator size="small" color={colors.bgBase} /> : null}
          <Text style={styles.installText}>
            {installing
              ? progress < 1
                ? `Downloading ${Math.round(progress * 100)}%`
                : 'Waiting for Android installer…'
              : 'Install APK'}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}
