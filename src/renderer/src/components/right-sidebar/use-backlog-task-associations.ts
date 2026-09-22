import { useEffect, useState } from 'react'
import { listBacklogTaskAssociations } from '@/lib/backlog-task-association-client'
import { resolveBacklogRoute } from '@/lib/backlog-rpc'
import { useBacklogTaskStartRequest } from './backlog-task-start-request'

export function useBacklogTaskAssociations(
  workspaceId: string | null,
  visible: boolean
): ReadonlySet<string> {
  const request = useBacklogTaskStartRequest()
  const [linked, setLinked] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    if (!workspaceId || !visible) {
      return
    }
    let current = true
    void (async () => {
      try {
        const associations = await listBacklogTaskAssociations(resolveBacklogRoute(workspaceId))
        if (current) {
          setLinked(new Set(associations.map((entry) => entry.taskId)))
        }
      } catch {
        // Older runtimes keep the task list usable without association decorations.
        if (current) {
          setLinked(new Set())
        }
      }
    })()
    return () => {
      current = false
    }
  }, [workspaceId, visible, request])
  return linked
}
