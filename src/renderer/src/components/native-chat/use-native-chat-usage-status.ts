import { useMemo, useState } from 'react'
import type { NativeChatUsageStatus } from '../../../../shared/native-chat-usage-status'

export function useNativeChatUsageStatus(sourceKey: string) {
  const [state, setState] = useState<{ sourceKey: string; value?: NativeChatUsageStatus }>({
    sourceKey
  })
  const control = useMemo(
    () => ({
      replace: (value: NativeChatUsageStatus | undefined) => setState({ sourceKey, value }),
      append: (value: NativeChatUsageStatus | undefined) => {
        if (value) {
          setState((current) => ({
            sourceKey,
            value: { ...(current.sourceKey === sourceKey ? current.value : undefined), ...value }
          }))
        }
      },
      markStale: () =>
        setState((current) => ({
          sourceKey,
          value:
            current.sourceKey === sourceKey && current.value?.contextUsage
              ? { contextUsage: { ...current.value.contextUsage, stale: true } }
              : undefined
        }))
    }),
    [sourceKey]
  )
  return [state.sourceKey === sourceKey ? state.value : undefined, control] as const
}
