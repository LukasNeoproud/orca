import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { CircleAlert, Loader2, Play } from 'lucide-react'
import { useAppStore } from '@/store'
import { findWorktreeById } from '@/store/github/worktree-refresh'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree/id'
import { isAndroidAppRunActive, useAndroidAppRunState } from './android-app-run-state'
import { AndroidAppRunPanel, androidAppRunPhaseLabel } from './AndroidAppRunPanel'

/** Whether the workspace is an Android project on this machine, where the SDK and adb live. */
function useLocalAndroidProjectPath(worktreeId: string): string | null {
  const worktreePath = useAppStore((state) => findWorktreeById(state, worktreeId)?.path ?? null)
  const isLocal = useAppStore(
    (state) => getExecutionHostIdForWorktree(state, worktreeId) === LOCAL_EXECUTION_HOST_ID
  )
  const [androidPath, setAndroidPath] = useState<string | null>(null)
  useEffect(() => {
    setAndroidPath(null)
    // Absent in the web client, which has no local SDK to drive.
    const api = window.api.androidAppRun
    if (!api || !worktreePath || !isLocal) {
      return
    }
    let current = true
    api
      .isAndroidProject({ worktreePath })
      .then((isAndroid) => {
        if (current && isAndroid) {
          setAndroidPath(worktreePath)
        }
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [isLocal, worktreePath])
  return androidPath
}

/** Tab-bar Run action for Android projects: build a variant and start it on a device. */
export function AndroidAppRunButton({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const worktreePath = useLocalAndroidProjectPath(worktreeId)
  const repoId = useMemo(() => getRepoIdFromWorktreeId(worktreeId), [worktreeId])
  const repo = useAppStore((state) => state.repos.find((candidate) => candidate.id === repoId))
  const run = useAndroidAppRunState(worktreeId)
  const [open, setOpen] = useState(false)
  if (!worktreePath || !repo) {
    return null
  }
  const running = isAndroidAppRunActive(run)
  const label = translate('components.androidAppRun.open', 'Run Android app')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              data-testid="android-app-run-button"
              className="my-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : run?.phase === 'failed' ? (
                <CircleAlert className="size-3.5 text-destructive" />
              ) : (
                <Play className="size-3.5" />
              )}
              {/* The phase stays readable here once the popover is dismissed. */}
              <span className="text-xs font-medium">
                {running && run
                  ? androidAppRunPhaseLabel(run.phase)
                  : translate('components.androidAppRun.label', 'Run app')}
              </span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-96">
        <AndroidAppRunPanel
          worktreeId={worktreeId}
          worktreePath={worktreePath}
          repoId={repo.id}
          savedVariant={repo.androidBuildVariant}
          onShowOutput={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
