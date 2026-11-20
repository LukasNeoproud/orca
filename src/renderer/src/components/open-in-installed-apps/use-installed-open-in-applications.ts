import { useEffect, useState } from 'react'
import type { OpenInApplication } from '../../../../shared/ui-chrome-types'

/** Known editors installed on this computer; null until the main process answers. */
export function useInstalledOpenInApplications(): readonly OpenInApplication[] | null {
  const [installed, setInstalled] = useState<readonly OpenInApplication[] | null>(null)
  useEffect(() => {
    let cancelled = false
    window.api.shell.detectOpenInApplications().then(
      (applications) => {
        if (!cancelled) {
          setInstalled(applications)
        }
      },
      () => {
        if (!cancelled) {
          setInstalled([])
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [])
  return installed
}
