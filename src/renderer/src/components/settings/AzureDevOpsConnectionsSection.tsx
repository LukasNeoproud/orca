import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { AzureDevOpsConnectionsStatus } from '../../../../shared/azure-devops-review-types'

export function useAzureDevOpsConnections(): {
  status: AzureDevOpsConnectionsStatus | null
  reload: () => Promise<void>
} {
  const [status, setStatus] = useState<AzureDevOpsConnectionsStatus | null>(null)
  const reload = useCallback(async () => {
    const api = window.api.azureDevOpsConnections
    if (!api) {
      return
    }
    try {
      setStatus(await api.status())
    } catch {
      setStatus(null)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { status, reload }
}

function ConnectForm({
  initialUrl,
  onConnected,
  onCancel
}: {
  initialUrl: string
  onConnected: () => void
  onCancel: () => void
}): React.JSX.Element {
  const [organizationUrl, setOrganizationUrl] = useState(initialUrl)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    const api = window.api.azureDevOpsConnections
    if (!api) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.connect({ organizationUrl, token })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(
        translate('azureDevOpsReview.connected', 'Connected to {{value0}}', {
          value0: result.account ?? result.connection.label
        })
      )
      onConnected()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Input
        autoFocus
        aria-label={translate('azureDevOpsReview.organizationUrl', 'Organization URL')}
        placeholder="https://dev.azure.com/contoso"
        value={organizationUrl}
        onChange={(event) => setOrganizationUrl(event.target.value)}
        className="h-8 text-xs"
      />
      <Input
        type="password"
        aria-label={translate('azureDevOpsReview.token', 'Personal access token')}
        placeholder={translate(
          'azureDevOpsReview.tokenHint',
          'Personal access token with Code (Read & write) scope'
        )}
        value={token}
        onChange={(event) => setToken(event.target.value)}
        className="h-8 text-xs"
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {translate('azureDevOpsReview.cancel', 'Cancel')}
        </Button>
        <Button
          size="sm"
          disabled={busy || !organizationUrl.trim() || !token.trim()}
          onClick={() => void connect()}
        >
          {translate('azureDevOpsReview.connect', 'Connect')}
        </Button>
      </div>
    </div>
  )
}

/** Per-organization credentials used by the Pull requests panel and agent tools. */
export function AzureDevOpsConnectionsSection({
  status,
  reload
}: {
  status: AzureDevOpsConnectionsStatus
  reload: () => Promise<void>
}): React.JSX.Element {
  const [formUrl, setFormUrl] = useState<string | null>(null)
  const missing = status.detected.filter((org) => org.credentialSource === null)

  const disconnect = async (connectionId: string): Promise<void> => {
    await window.api.azureDevOpsConnections?.disconnect({ connectionId })
    await reload()
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-medium">
          {translate('azureDevOpsReview.organizations', 'Organizations')}
        </p>
        {formUrl === null ? (
          <Button variant="outline" size="xs" onClick={() => setFormUrl('')}>
            <Plus className="size-3" />
            {translate('azureDevOpsReview.addOrganization', 'Add organization')}
          </Button>
        ) : null}
      </div>
      {status.connections.length === 0 && missing.length === 0 && formUrl === null ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'azureDevOpsReview.noConnections',
            'Connect an organization to list pull requests from its repositories added to Orca.'
          )}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {status.connections.map((connection) => (
          <li key={connection.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{connection.label}</span>{' '}
              <span className="text-muted-foreground">{connection.organizationUrl}</span>
              {connection.credentialError ? (
                <span className="block text-destructive">{connection.credentialError}</span>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setFormUrl(connection.organizationUrl)}
            >
              {translate('azureDevOpsReview.reconnect', 'Reconnect')}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => void disconnect(connection.id)}>
              {translate('azureDevOpsReview.disconnect', 'Disconnect')}
            </Button>
          </li>
        ))}
        {missing.map((org) => (
          <li key={org.organizationKey} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className="font-medium text-foreground">{org.label}</span>{' '}
              {org.repoCount === 1
                ? translate(
                    'azureDevOpsReview.detectedOrgOne',
                    'detected in 1 repository, not connected'
                  )
                : translate(
                    'azureDevOpsReview.detectedOrg',
                    'detected in {{value0}} repositories, not connected',
                    { value0: org.repoCount }
                  )}
            </span>
            <Button variant="outline" size="xs" onClick={() => setFormUrl(org.organizationUrl)}>
              {translate('azureDevOpsReview.connect', 'Connect')}
            </Button>
          </li>
        ))}
      </ul>
      {formUrl !== null ? (
        <ConnectForm
          key={formUrl}
          initialUrl={formUrl}
          onCancel={() => setFormUrl(null)}
          onConnected={() => {
            setFormUrl(null)
            void reload()
          }}
        />
      ) : null}
    </div>
  )
}
