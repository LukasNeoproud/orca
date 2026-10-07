import { useCallback, useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { translate } from '@/i18n/i18n'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'
import type {
  PowerModeSetupActionResult,
  PowerModeSetupStatus
} from '../../../../shared/host-system-types'

function statusLabel(status: PowerModeSetupStatus): string {
  if (!status.installed) {
    return translate(
      'auto.components.settings.MobileHostPowerControlSection.notInstalled',
      'Not allowed yet.'
    )
  }
  if (status.verified === false) {
    return translate(
      'auto.components.settings.MobileHostPowerControlSection.broken',
      'Installed, but macOS rejected it. Remove it and allow again.'
    )
  }
  return translate(
    'auto.components.settings.MobileHostPowerControlSection.installed',
    'Allowed. Paired phones can switch power mode.'
  )
}

export function MobileHostPowerControlSection(): React.JSX.Element | null {
  const api = window.api.powerModeSetup
  const isMac = getRendererAppPlatform() === 'darwin' && !isWebClientLocation()
  const [status, setStatus] = useState<PowerModeSetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isMac || !api) {
      return
    }
    let active = true
    void api.getStatus().then(
      (next) => active && setStatus(next),
      () =>
        active &&
        setError(
          translate(
            'auto.components.settings.MobileHostPowerControlSection.loadError',
            'Could not read the power control setup.'
          )
        )
    )
    return () => {
      active = false
    }
  }, [api, isMac])

  const run = useCallback(async (action: () => Promise<PowerModeSetupActionResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (result.ok) {
        setStatus(result.status)
      } else if (result.reason !== 'cancelled') {
        setError(
          result.message ??
            translate(
              'auto.components.settings.MobileHostPowerControlSection.actionError',
              'macOS did not apply the change.'
            )
        )
      }
    } catch {
      setError(
        translate(
          'auto.components.settings.MobileHostPowerControlSection.actionError',
          'macOS did not apply the change.'
        )
      )
    } finally {
      setBusy(false)
    }
  }, [])

  if (!isMac || !api || !status?.supported) {
    return null
  }

  return (
    <section className="space-y-3" aria-labelledby="mobile-host-power-control-title">
      <div className="space-y-1">
        <h3 id="mobile-host-power-control-title" className="text-sm font-medium">
          {translate(
            'auto.components.settings.MobileHostPowerControlSection.title',
            'Host Power Control'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.MobileHostPowerControlSection.description',
            'Lets paired phones switch Low Power Mode, and lets Orca put this Mac to sleep when it overheats even if another app has disabled sleep. macOS asks for your administrator password once.'
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.MobileHostPowerControlSection.scope',
            'The rule applies to your macOS account, not only to Orca, and permits only these three pmset commands.'
          )}
        </p>
      </div>
      <p className="text-xs" role="status">
        {statusLabel(status)}
      </p>
      <div className="flex gap-2">
        {status.installed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(api.remove)}
          >
            {translate('auto.components.settings.MobileHostPowerControlSection.remove', 'Remove')}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(api.install)}>
            {translate('auto.components.settings.MobileHostPowerControlSection.allow', 'Allow')}
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
