import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { translate } from '@/i18n/i18n'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { DeviceApprovalEnrollmentStatus } from '../../../../shared/device-approval-enrollment-status'

const POLL_INTERVAL_MS = 1_000
const FINGERPRINT_PREFIX_LENGTH = 12

const isPending = (phase: DeviceApprovalEnrollmentStatus['phase']): boolean =>
  phase === 'waiting' || phase === 'verifying' || phase === 'confirming'

export function MobileDeviceApprovalsSection(): React.JSX.Element | null {
  const [status, setStatus] = useState<DeviceApprovalEnrollmentStatus>({ phase: 'idle' })
  const [fingerprintPrefix, setFingerprintPrefix] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const requestEpoch = useRef(0)
  const isMac = getRendererAppPlatform() === 'darwin' && !isWebClientLocation()

  useEffect(() => {
    if (!isMac || !window.api.mobile.getDeviceApprovalEnrollmentStatus) {
      return
    }
    const epoch = ++requestEpoch.current
    let active = true
    void window.api.mobile.getDeviceApprovalEnrollmentStatus().then(
      (next) => {
        if (active && epoch === requestEpoch.current) {
          setNow(Date.now())
          setStatus(next)
        }
      },
      () => {
        if (active && epoch === requestEpoch.current) {
          setRequestError(
            translate(
              'auto.components.settings.MobileDeviceApprovalsSection.loadError',
              'Could not load device approval status.'
            )
          )
        }
      }
    )
    return () => {
      active = false
    }
  }, [isMac])

  useEffect(() => {
    if (!isMac || !isPending(status.phase)) {
      return
    }
    const timer = window.setInterval(() => {
      const epoch = requestEpoch.current
      void window.api.mobile.getDeviceApprovalEnrollmentStatus().then(
        (next) => {
          if (epoch === requestEpoch.current) {
            setNow(Date.now())
            setStatus(next)
          }
        },
        () => {
          if (epoch === requestEpoch.current) {
            setRequestError(
              translate(
                'auto.components.settings.MobileDeviceApprovalsSection.refreshError',
                'Could not refresh device approval status.'
              )
            )
          }
        }
      )
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isMac, status.phase])

  useEffect(() => {
    if (status.expiresAt === undefined) {
      return
    }
    const delay = Math.max(0, status.expiresAt - Date.now())
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [status.expiresAt])

  const runAction = useCallback(async (action: () => Promise<DeviceApprovalEnrollmentStatus>) => {
    const epoch = ++requestEpoch.current
    setBusy(true)
    setRequestError(null)
    try {
      const next = await action()
      if (epoch === requestEpoch.current) {
        setNow(Date.now())
        setStatus(next)
        if (next.phase === 'idle' || next.phase === 'waiting' || next.phase === 'complete') {
          setFingerprintPrefix('')
        }
      }
    } catch (error) {
      if (epoch === requestEpoch.current) {
        setRequestError(
          error instanceof Error && error.message
            ? error.message
            : translate(
                'auto.components.settings.MobileDeviceApprovalsSection.actionError',
                'Device approval request failed. Try again.'
              )
        )
      }
    } finally {
      if (epoch === requestEpoch.current) {
        setBusy(false)
      }
    }
  }, [])

  if (!isMac) {
    return null
  }

  const expired =
    status.expiresAt !== undefined &&
    status.expiresAt <= now &&
    (isPending(status.phase) || status.phase === 'ready')
  const fingerprint = status.fingerprint ?? ''
  const prefixMatches =
    fingerprintPrefix.length === FINGERPRINT_PREFIX_LENGTH &&
    fingerprintPrefix.toLowerCase() ===
      fingerprint.slice(0, FINGERPRINT_PREFIX_LENGTH).toLowerCase()

  return (
    <section className="space-y-3" aria-labelledby="mobile-device-approvals-title">
      <div className="space-y-1">
        <h3 id="mobile-device-approvals-title" className="text-sm font-medium">
          {translate(
            'auto.components.settings.MobileDeviceApprovalsSection.title',
            'Device Approvals'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.MobileDeviceApprovalsSection.description',
            'Register a phone to approve requests for this Mac.'
          )}
        </p>
      </div>

      {(status.phase === 'idle' || status.phase === 'error' || expired) && (
        <Button
          type="button"
          size="sm"
          variant={status.phase === 'idle' ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => void runAction(() => window.api.mobile.startDeviceApprovalEnrollment())}
        >
          {status.phase === 'idle'
            ? translate(
                'auto.components.settings.MobileDeviceApprovalsSection.start',
                'Start registration'
              )
            : translate(
                'auto.components.settings.MobileDeviceApprovalsSection.restart',
                'Try registration again'
              )}
        </Button>
      )}

      {(isPending(status.phase) || status.phase === 'ready') && !expired && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.MobileDeviceApprovalsSection.phonePath',
              'In Orca Mobile, open this paired Mac, then go to Settings → Device approvals and tap Register this phone on the pending request. The shield icon in the host header is a shortcut.'
            )}
          </p>
          {status.phase === 'waiting' && (
            <p className="text-sm" role="status">
              {translate(
                'auto.components.settings.MobileDeviceApprovalsSection.waiting',
                'Waiting for your phone…'
              )}
            </p>
          )}
          {status.phase === 'verifying' && (
            <p className="text-sm" role="status">
              {translate(
                'auto.components.settings.MobileDeviceApprovalsSection.verifying',
                'Checking Android device attestation…'
              )}
            </p>
          )}
          {status.phase === 'ready' && (
            <p className="text-sm" role="status">
              {translate(
                'auto.components.settings.MobileDeviceApprovalsSection.ready',
                'Compare the fingerprint on both devices. Confirming will ask for Touch ID on this Mac.'
              )}
            </p>
          )}
          {status.phase === 'confirming' && (
            <p className="text-sm" role="status">
              {translate(
                'auto.components.settings.MobileDeviceApprovalsSection.confirming',
                'Confirming registration…'
              )}
            </p>
          )}
          {status.phase === 'ready' && fingerprint && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="device-approval-fingerprint">
                  {translate(
                    'auto.components.settings.MobileDeviceApprovalsSection.fingerprint',
                    'Phone fingerprint'
                  )}
                </Label>
                <p id="device-approval-fingerprint-help" className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.MobileDeviceApprovalsSection.compare',
                    'Compare the full fingerprint with your phone. Enter its first 12 characters to confirm the match.'
                  )}
                </p>
              </div>
              <p
                className="select-text break-all rounded-md border border-border px-3 py-2 font-mono text-xs"
                aria-label={translate(
                  'auto.components.settings.MobileDeviceApprovalsSection.fullFingerprint',
                  'Full phone fingerprint'
                )}
              >
                {fingerprint}
              </p>
              <Input
                id="device-approval-fingerprint"
                aria-describedby="device-approval-fingerprint-help"
                value={fingerprintPrefix}
                maxLength={FINGERPRINT_PREFIX_LENGTH}
                autoComplete="off"
                spellCheck={false}
                className="max-w-56 font-mono"
                onChange={(event) => setFingerprintPrefix(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || !prefixMatches}
                onClick={() =>
                  void runAction(() =>
                    window.api.mobile.confirmDeviceApprovalEnrollment({ fingerprintPrefix })
                  )
                }
              >
                {translate(
                  'auto.components.settings.MobileDeviceApprovalsSection.confirm',
                  'Confirm fingerprint'
                )}
              </Button>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void runAction(() => window.api.mobile.cancelDeviceApprovalEnrollment())}
          >
            {translate('auto.components.settings.MobileDeviceApprovalsSection.cancel', 'Cancel')}
          </Button>
        </div>
      )}

      {expired && (
        <p className="text-sm text-destructive" role="alert">
          {translate(
            'auto.components.settings.MobileDeviceApprovalsSection.expired',
            'Registration expired. Start again.'
          )}
        </p>
      )}
      {status.phase === 'error' && (
        <p className="text-sm text-destructive" role="alert">
          {status.error ??
            translate(
              'auto.components.settings.MobileDeviceApprovalsSection.error',
              'Registration failed. Start again.'
            )}
        </p>
      )}
      {status.phase === 'complete' && (
        <p className="text-sm" role="status">
          {translate(
            'auto.components.settings.MobileDeviceApprovalsSection.complete',
            'Phone registered for device approvals.'
          )}
        </p>
      )}
      {requestError && (
        <p className="text-sm text-destructive" role="alert">
          {requestError}
        </p>
      )}
    </section>
  )
}
