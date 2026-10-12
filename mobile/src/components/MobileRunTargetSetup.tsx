import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  LOCAL_EXECUTION_HOST_ID,
  getLocalExecutionHostLabel,
  isRuntimeOwnedSshTargetId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../src/shared/execution-host'
import { PROJECT_HOST_SETUP_RUNTIME_CAPABILITY } from '../../../src/shared/protocol-version'
import { PROJECT_HOST_SETUP_HOST_LOCAL_LINK_RUNTIME_CAPABILITY } from '../../../src/shared/host-feature-runtime-capabilities'
import {
  getProjectIdentityKey,
  getProjectProviderIdentity,
  isHostLocalProjectId
} from '../../../src/shared/project-host-setup-projection'
import type { ProjectHostSetupResult } from '../../../src/shared/project-types'
import type { SshTargetSummary } from '../../../src/shared/ssh-types'
import type { RpcClient } from '../transport/rpc-client'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { BottomDrawer } from './BottomDrawer'
import type { MobileWorkspaceRepo } from './new-worktree-modal-types'
import { TEXT_INPUT_FONT_SIZE } from '../platform/text-input-font-size'

type HostOption = {
  id: ExecutionHostId
  label: string
  connected: boolean
}

type Props = {
  client: RpcClient | null
  selectedRepo: MobileWorkspaceRepo | null
  hostPlatform?: NodeJS.Platform | null
  visible: boolean
  onClose: () => void
  onReady: (repoId: string) => void | Promise<void>
}

type SetupMethod = 'existing' | 'clone'

const HOST_LOCAL_PROJECT_SETUP_UNAVAILABLE =
  'Update Orca on this host to set up folder projects and projects without a Git remote on another host.'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function responseResult<T>(response: Awaited<ReturnType<RpcClient['sendRequest']>>): T {
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  return response.result as T
}

export function buildMobileRunTargetSetupHosts(
  targets: readonly SshTargetSummary[],
  existingHostIds: ReadonlySet<string>,
  localPlatform: NodeJS.Platform | null = null
): HostOption[] {
  const hosts: HostOption[] = []
  if (!existingHostIds.has(LOCAL_EXECUTION_HOST_ID)) {
    hosts.push({
      id: LOCAL_EXECUTION_HOST_ID,
      label: getLocalExecutionHostLabel(localPlatform),
      connected: true
    })
  }
  for (const target of targets) {
    if (isRuntimeOwnedSshTargetId(target.id)) {
      continue
    }
    const id = toSshExecutionHostId(target.id)
    if (!existingHostIds.has(id)) {
      hosts.push({ id, label: `SSH · ${target.label}`, connected: target.connected !== false })
    }
  }
  return hosts
}

export function MobileRunTargetSetup({
  client,
  selectedRepo,
  hostPlatform,
  visible,
  onClose,
  onReady
}: Props) {
  const [hosts, setHosts] = useState<HostOption[]>([])
  const [hostId, setHostId] = useState<ExecutionHostId | null>(null)
  const [method, setMethod] = useState<SetupMethod>('existing')
  const [path, setPath] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(false)
  const requestEpoch = useRef(0)
  const projectId = selectedRepo ? getProjectIdentityKey(selectedRepo) : undefined

  useEffect(() => {
    const epoch = ++requestEpoch.current
    setHosts([])
    setHostId(null)
    setMethod('existing')
    setPath('')
    setUrl('')
    setError('')
    setSupported(false)
    setBusy(false)
    setLoading(visible && client !== null && projectId !== undefined)
    if (!visible || !client || !projectId) {
      return () => {
        requestEpoch.current += 1
      }
    }
    void (async () => {
      try {
        const status = responseResult<{ capabilities?: unknown; hostPlatform?: NodeJS.Platform }>(
          await client.sendRequest('status.get')
        )
        if (
          !Array.isArray(status.capabilities) ||
          !status.capabilities.includes(PROJECT_HOST_SETUP_RUNTIME_CAPABILITY)
        ) {
          throw new Error('Update Orca on this host to set up projects.')
        }
        if (
          isHostLocalProjectId(projectId) &&
          !status.capabilities.includes(PROJECT_HOST_SETUP_HOST_LOCAL_LINK_RUNTIME_CAPABILITY)
        ) {
          throw new Error(HOST_LOCAL_PROJECT_SETUP_UNAVAILABLE)
        }
        const [sshResponse, setupsResponse] = await Promise.all([
          client.sendRequest('ssh.listTargetSummaries'),
          client.sendRequest('projectHostSetup.list')
        ])
        const targets = responseResult<{ targets: SshTargetSummary[] }>(sshResponse).targets
        const setups = responseResult<{ setups: { projectId: string; hostId: string }[] }>(
          setupsResponse
        ).setups
        if (requestEpoch.current !== epoch) {
          return
        }
        const existingHostIds = new Set(
          setups.filter((setup) => setup.projectId === projectId).map((setup) => setup.hostId)
        )
        setHosts(
          buildMobileRunTargetSetupHosts(
            targets,
            existingHostIds,
            hostPlatform ?? status.hostPlatform
          )
        )
        setSupported(true)
      } catch (cause) {
        if (requestEpoch.current === epoch) {
          setError(errorMessage(cause))
        }
      } finally {
        if (requestEpoch.current === epoch) {
          setLoading(false)
        }
      }
    })()
    return () => {
      requestEpoch.current += 1
    }
  }, [client, hostPlatform, projectId, visible])

  const selectedHost = hosts.find((host) => host.id === hostId)
  const isFolder = selectedRepo?.kind === 'folder'
  const canClone = !isFolder && hostId === LOCAL_EXECUTION_HOST_ID
  const canSubmit =
    supported &&
    selectedHost?.connected === true &&
    !busy &&
    (method === 'existing' ? path.trim().length > 0 : canClone && url.trim() && path.trim())

  async function submit(): Promise<void> {
    if (!client || !selectedRepo || !projectId || !hostId || !canSubmit) {
      return
    }
    const epoch = requestEpoch.current
    setError('')
    setBusy(true)
    try {
      const projectProviderIdentity = getProjectProviderIdentity(selectedRepo)
      const params = {
        projectId,
        ...(projectProviderIdentity ? { projectProviderIdentity } : {}),
        hostId,
        displayName: selectedRepo.displayName
      }
      const response =
        method === 'clone'
          ? await client.sendRequest(
              'projectHostSetup.clone',
              { ...params, url: url.trim(), destination: path.trim() },
              { timeoutMs: 10 * 60_000, failWhenDisconnected: true }
            )
          : await client.sendRequest(
              'projectHostSetup.setupExistingFolder',
              { ...params, path: path.trim(), kind: isFolder ? 'folder' : 'git' },
              { timeoutMs: 60_000, failWhenDisconnected: true }
            )
      const result = responseResult<{ result: ProjectHostSetupResult }>(response).result
      if (requestEpoch.current === epoch) {
        await onReady(result.repo.id)
      }
    } catch (cause) {
      if (requestEpoch.current === epoch) {
        setError(errorMessage(cause))
      }
    } finally {
      if (requestEpoch.current === epoch) {
        setBusy(false)
      }
    }
  }

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>Set up another run target</Text>
        <Text style={styles.subtitle}>{selectedRepo?.displayName ?? 'Project'}</Text>
        {loading ? <ActivityIndicator color={colors.textMuted} /> : null}
        {!loading && supported ? (
          <>
            <Text style={styles.label}>Host</Text>
            {hosts.length === 0 ? (
              <Text style={styles.hint}>
                This project is already set up on every available host.
              </Text>
            ) : (
              hosts.map((host) => (
                <Pressable
                  key={host.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: hostId === host.id, disabled: !host.connected }}
                  disabled={!host.connected || busy}
                  onPress={() => {
                    setHostId(host.id)
                    setMethod('existing')
                    setError('')
                  }}
                  style={[styles.row, hostId === host.id && styles.selectedRow]}
                >
                  <Text style={styles.rowText}>{host.label}</Text>
                  {!host.connected ? <Text style={styles.hint}>Connect first</Text> : null}
                </Pressable>
              ))
            )}
            {selectedHost ? (
              <>
                <Text style={styles.label}>Add project from</Text>
                <View style={styles.methods}>
                  <Pressable
                    style={[styles.method, method === 'existing' && styles.selectedRow]}
                    disabled={busy}
                    onPress={() => {
                      setMethod('existing')
                      setError('')
                    }}
                  >
                    <Text style={styles.rowText}>
                      {isFolder ? 'Existing folder' : 'Existing checkout'}
                    </Text>
                  </Pressable>
                  {canClone ? (
                    <Pressable
                      style={[styles.method, method === 'clone' && styles.selectedRow]}
                      disabled={busy}
                      onPress={() => {
                        setMethod('clone')
                        setError('')
                      }}
                    >
                      <Text style={styles.rowText}>Clone from URL</Text>
                    </Pressable>
                  ) : null}
                </View>
                {method === 'clone' ? (
                  <TextInput
                    accessibilityLabel="Repository URL"
                    placeholder="Repository URL"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={url}
                    editable={!busy}
                    onChangeText={(value) => {
                      setUrl(value)
                      setError('')
                    }}
                    style={styles.input}
                  />
                ) : null}
                <TextInput
                  accessibilityLabel={
                    method === 'clone' ? 'Clone destination' : 'Project path on host'
                  }
                  placeholder={method === 'clone' ? 'Destination on host' : 'Path on host'}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={path}
                  editable={!busy}
                  onChangeText={(value) => {
                    setPath(value)
                    setError('')
                  }}
                  style={styles.input}
                />
              </>
            ) : null}
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={[styles.submit, !canSubmit && styles.disabled]}
        >
          <Text style={styles.submitText}>
            {busy ? 'Adding…' : method === 'clone' ? 'Clone project' : 'Add project'}
          </Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingBottom: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.titleSize, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: typography.metaSize, marginBottom: spacing.sm },
  label: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600',
    marginTop: spacing.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  selectedRow: { borderColor: colors.textSecondary, backgroundColor: colors.bgRaised },
  rowText: { color: colors.textPrimary, fontSize: typography.bodySize },
  hint: { color: colors.textMuted, fontSize: typography.metaSize },
  methods: { flexDirection: 'row', gap: spacing.sm },
  method: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  input: {
    color: colors.textPrimary,
    backgroundColor: colors.bgRaised,
    borderColor: colors.borderSubtle,
    borderWidth: 1,
    borderRadius: radii.input,
    padding: spacing.md,
    fontSize: TEXT_INPUT_FONT_SIZE,
    fontFamily: typography.monoFamily
  },
  error: { color: colors.statusRed, fontSize: typography.metaSize },
  submit: {
    alignItems: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.surfaceBright,
    padding: spacing.md,
    marginTop: spacing.sm
  },
  disabled: { opacity: 0.4 },
  submitText: { color: colors.bgBase, fontSize: typography.bodySize, fontWeight: '600' }
})
