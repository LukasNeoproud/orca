import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Play, RefreshCw, Square, SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AndroidAppRunPhase } from '../../../../shared/android-app-run-types'
import {
  beginAndroidAppRun,
  isAndroidAppRunActive,
  useAndroidAppRunState
} from './android-app-run-state'
import { useAndroidRunTargets, type AndroidRunDevice } from './use-android-run-targets'
import { useAndroidBuildDirectory } from './use-android-build-directory'

const LAST_DEVICE_STORAGE_KEY = 'orca.androidAppRun.lastDevice'

function readLastDevice(): string {
  try {
    return window.localStorage.getItem(LAST_DEVICE_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function androidAppRunPhaseLabel(phase: AndroidAppRunPhase): string {
  switch (phase) {
    case 'boot':
      return translate('components.androidAppRun.phase.boot', 'Starting the device…')
    case 'build':
      return translate('components.androidAppRun.phase.build', 'Building…')
    case 'install':
      return translate('components.androidAppRun.phase.install', 'Installing…')
    case 'launch':
      return translate('components.androidAppRun.phase.launch', 'Launching…')
    case 'done':
      return translate('components.androidAppRun.phase.done', 'App is running')
    case 'failed':
      return translate('components.androidAppRun.phase.failed', 'Run failed')
    case 'cancelled':
      return translate('components.androidAppRun.phase.cancelled', 'Run stopped')
  }
}

function DeviceItems({
  heading,
  devices
}: {
  heading: string
  devices: AndroidRunDevice[]
}): React.JSX.Element | null {
  if (devices.length === 0) {
    return null
  }
  return (
    <SelectGroup>
      <SelectLabel>{heading}</SelectLabel>
      {devices.map((device) => (
        <SelectItem key={device.id} value={device.id}>
          {device.name}
        </SelectItem>
      ))}
    </SelectGroup>
  )
}

/** Device and build-variant choice plus the progress of the current run. */
export function AndroidAppRunPanel({
  worktreeId,
  worktreePath,
  repoId,
  savedVariant,
  onShowOutput
}: {
  worktreeId: string
  /** The workspace's own directory; the build may run from another worktree of its repository. */
  worktreePath: string
  repoId: string
  savedVariant: string | undefined
  /** Called after the build terminal tab was brought forward. */
  onShowOutput: () => void
}): React.JSX.Element {
  const updateRepo = useAppStore((state) => state.updateRepo)
  const run = useAndroidAppRunState(worktreeId)
  const buildDirectory = useAndroidBuildDirectory({
    worktreeId,
    repoId,
    workspacePath: worktreePath
  })
  const buildPath = buildDirectory.selected.path
  const { devices, variants, refreshDevices, refreshVariants } = useAndroidRunTargets({
    open: true,
    worktreePath: buildPath
  })
  const outputTab = useAppStore((state) =>
    state.unifiedTabsByWorktree[worktreeId]?.find(
      (tab) => tab.contentType === 'terminal' && tab.entityId === run?.terminalTabId
    )
  )
  const activateTab = useAppStore((state) => state.activateTab)
  const running = isAndroidAppRunActive(run)
  const [device, setDevice] = useState(readLastDevice)
  // The saved variant is usable at once; the Gradle listing can take a minute on a cold daemon.
  const variant = savedVariant ?? ''
  const variantOptions =
    variant && !variants.value.includes(variant) ? [variant, ...variants.value] : variants.value

  // Default to a device that is already up, then to the first AVD.
  useEffect(() => {
    if (devices.status !== 'ready' || devices.value.some((candidate) => candidate.id === device)) {
      return
    }
    const fallback =
      devices.value.find((candidate) => candidate.state === 'booted') ?? devices.value[0]
    setDevice(fallback?.id ?? '')
  }, [device, devices])
  useEffect(() => {
    if (!variant && variants.status === 'ready' && variants.value.length > 0) {
      const preferred = variants.value.find((name) => /debug$/i.test(name)) ?? variants.value[0]!
      void updateRepo(repoId, { androidBuildVariant: preferred })
    }
  }, [repoId, updateRepo, variant, variants])

  const outputRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [run?.output])

  const start = (): void => {
    const target = devices.value.find((candidate) => candidate.id === device)
    if (!target || !variant) {
      return
    }
    try {
      window.localStorage.setItem(LAST_DEVICE_STORAGE_KEY, device)
    } catch {
      // Remembering the device is a convenience only.
    }
    const runId = createBrowserUuid()
    beginAndroidAppRun(worktreeId, runId)
    void window.api.androidAppRun
      .run({ runId, worktreeId, worktreePath: buildPath, variant, device })
      .then((result) => {
        // An AVD Orca booted has no window of its own, so show it in the emulator pane.
        if (result.phase === 'done' && result.serial && target.state === 'shutdown') {
          void callRuntimeRpc({ kind: 'local' }, 'emulator.attach', {
            device: result.serial,
            worktree: worktreeId,
            focus: true
          }).catch(() => undefined)
        }
      })
      .catch(() => undefined)
  }

  const booted = devices.value.filter((candidate) => candidate.state !== 'shutdown')
  const avds = devices.value.filter((candidate) => candidate.state === 'shutdown')
  const problem =
    devices.error ?? variants.error ?? (run?.phase === 'failed' ? run.detail : undefined)

  return (
    <div
      className="scrollbar-sleek grid max-h-[var(--radix-popover-content-available-height)] min-w-0 gap-3 overflow-y-auto p-3"
      data-testid="android-app-run-panel"
    >
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="android-app-run-device">
          {translate('components.androidAppRun.device', 'Device')}
        </Label>
        <div className="flex items-center gap-1">
          <Select value={device} onValueChange={setDevice} disabled={running}>
            <SelectTrigger id="android-app-run-device" size="sm" className="min-w-0 flex-1">
              <SelectValue
                placeholder={
                  devices.status === 'loading'
                    ? translate('components.androidAppRun.loadingDevices', 'Looking for devices…')
                    : translate('components.androidAppRun.noDevices', 'No device or emulator found')
                }
              />
            </SelectTrigger>
            <SelectContent>
              <DeviceItems
                heading={translate('components.androidAppRun.runningDevices', 'Running')}
                devices={booted}
              />
              <DeviceItems
                heading={translate(
                  'components.androidAppRun.availableEmulators',
                  'Emulators (started on Run)'
                )}
                devices={avds}
              />
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate('components.androidAppRun.refreshDevices', 'Refresh devices')}
            disabled={devices.status === 'loading'}
            onClick={refreshDevices}
          >
            <RefreshCw />
          </Button>
        </div>
      </div>

      {buildDirectory.directories.length > 1 ? (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="android-app-run-directory">
            {translate('components.androidAppRun.buildFrom', 'Build from')}
          </Label>
          <Select value={buildPath} onValueChange={buildDirectory.select} disabled={running}>
            <SelectTrigger id="android-app-run-directory" size="sm" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {buildDirectory.directories.map((directory) => (
                <SelectItem key={directory.path} value={directory.path}>
                  {/* Truncates in the trigger too, which mirrors this text. */}
                  <span className="block max-w-72 truncate">
                    {directory.isWorkspace
                      ? translate(
                          'components.androidAppRun.thisWorkspace',
                          '{{value0}} (this workspace)',
                          { value0: directory.label }
                        )
                      : directory.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="truncate text-xs text-muted-foreground" title={buildPath}>
            {buildDirectory.followsConversation
              ? translate(
                  'components.androidAppRun.followsConversation',
                  'The conversation in this tab is working in this worktree.'
                )
              : buildPath}
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="android-app-run-variant">
          {translate('components.androidAppRun.variant', 'Build variant')}
        </Label>
        <div className="flex items-center gap-1">
          <Select
            value={variant}
            onValueChange={(next) => void updateRepo(repoId, { androidBuildVariant: next })}
            disabled={running}
          >
            <SelectTrigger id="android-app-run-variant" size="sm" className="min-w-0 flex-1">
              <SelectValue
                placeholder={
                  variants.status === 'loading'
                    ? translate(
                        'components.androidAppRun.loadingVariants',
                        'Asking Gradle for variants…'
                      )
                    : translate('components.androidAppRun.noVariants', 'No build variants found')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {variantOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate('components.androidAppRun.refreshVariants', 'Reload variants')}
            disabled={variants.status === 'loading'}
            onClick={refreshVariants}
          >
            <RefreshCw className={variants.status === 'loading' ? 'animate-spin' : undefined} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'components.androidAppRun.variantHint',
            'One variant for the whole project, shared by all its workspaces.'
          )}
        </p>
      </div>

      {run ? (
        <div className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
              role="status"
            >
              {androidAppRunPhaseLabel(run.phase)}
            </div>
            {outputTab ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  activateTab(outputTab.id, { worktreeId })
                  onShowOutput()
                }}
              >
                <SquareTerminal />
                {translate('components.androidAppRun.showOutput', 'Show output')}
              </Button>
            ) : null}
          </div>
          {run.output ? (
            <pre
              ref={outputRef}
              className="scrollbar-sleek max-h-40 min-w-0 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-2xs break-all whitespace-pre-wrap text-muted-foreground"
            >
              {run.output}
            </pre>
          ) : null}
        </div>
      ) : null}
      {problem ? (
        <p className="scrollbar-sleek max-h-24 min-w-0 overflow-y-auto text-xs break-words text-destructive">
          {problem}
        </p>
      ) : null}

      {running && run ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void window.api.androidAppRun.cancel({ runId: run.runId })}
        >
          <Square />
          {translate('components.androidAppRun.stop', 'Stop')}
        </Button>
      ) : (
        <Button type="button" size="sm" disabled={!device || !variant} onClick={start}>
          <Play />
          {translate('components.androidAppRun.run', 'Run')}
        </Button>
      )}
    </div>
  )
}
