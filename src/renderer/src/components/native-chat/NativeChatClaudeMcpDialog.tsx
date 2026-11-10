import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { requestClaudeSessionControl } from '@/runtime/claude-session-control-client'
import type {
  ClaudeMcpServerStatus,
  ClaudeMcpServerSummary,
  ClaudeSessionControlRequest
} from '../../../../shared/claude-session-control'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { claudeControlErrorText } from './native-chat-claude-control-error-text'

function statusLabel(status: ClaudeMcpServerStatus): string {
  switch (status) {
    case 'connected':
      return translate('components.native-chat.claudeControls.mcp.connected', 'Connected')
    case 'failed':
      return translate('components.native-chat.claudeControls.mcp.failed', 'Failed')
    case 'needs-auth':
      return translate('components.native-chat.claudeControls.mcp.needsAuth', 'Needs sign-in')
    case 'pending':
      return translate('components.native-chat.claudeControls.mcp.pending', 'Connecting')
    case 'disabled':
      return translate('components.native-chat.claudeControls.mcp.disabled', 'Disabled')
  }
}

const STATUS_VARIANT = {
  connected: 'secondary',
  failed: 'destructive',
  'needs-auth': 'outline',
  pending: 'outline',
  disabled: 'outline'
} as const

type ServerAction = Exclude<Extract<ClaudeSessionControlRequest, { server: string }>['kind'], never>

/** `/mcp`: the MCP servers of this chat's running Claude, with what the terminal's /mcp can do. */
export function NativeChatClaudeMcpDialog({
  target,
  sessionId,
  onClose
}: {
  target: RuntimeClientTarget
  sessionId: string
  onClose: () => void
}): React.JSX.Element {
  const [servers, setServers] = useState<ClaudeMcpServerSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const reply = await requestClaudeSessionControl(target, sessionId, { kind: 'mcp-status' })
      setServers(reply.servers)
      setError(null)
    } catch (failure) {
      setError(claudeControlErrorText(failure))
    }
  }, [sessionId, target])
  useEffect(() => {
    void refresh()
  }, [refresh])
  // A sign-in finishes in the browser and a reconnect takes a moment: keep the list honest.
  const waiting = servers?.some((server) => server.status === 'pending') === true
  useEffect(() => {
    if (!waiting) {
      return
    }
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh, waiting])

  const run = async (server: ClaudeMcpServerSummary, kind: ServerAction): Promise<void> => {
    setBusy(server.name)
    setError(null)
    try {
      if (kind === 'mcp-toggle') {
        await requestClaudeSessionControl(target, sessionId, {
          kind,
          server: server.name,
          enabled: server.status === 'disabled'
        })
      } else if (kind === 'mcp-authenticate') {
        const reply = await requestClaudeSessionControl(target, sessionId, {
          kind,
          server: server.name
        })
        if (reply.authUrl) {
          await window.api.shell.openUrl(reply.authUrl)
        }
      } else {
        await requestClaudeSessionControl(target, sessionId, { kind, server: server.name })
      }
    } catch (failure) {
      setError(claudeControlErrorText(failure))
    }
    setBusy(null)
    await refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('components.native-chat.claudeControls.mcp.title', 'MCP servers')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'components.native-chat.claudeControls.mcp.description',
              'The servers this chat’s Claude loaded. Changes apply to this chat.'
            )}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div data-native-chat-mcp-servers className="max-h-[55vh] overflow-auto scrollbar-sleek">
          {servers === null && !error ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          {servers?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate(
                'components.native-chat.claudeControls.mcp.none',
                'No MCP servers are configured.'
              )}
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {servers?.map((server) => (
              <li key={server.name} className="flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {server.name}
                    </span>
                    <Badge variant={STATUS_VARIANT[server.status]}>
                      {statusLabel(server.status)}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      server.scope,
                      server.transport,
                      server.tools
                        ? translate(
                            'components.native-chat.claudeControls.mcp.tools',
                            '{{value0}} tools',
                            { value0: server.tools.length }
                          )
                        : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {server.error ? (
                    <p className="break-words text-xs text-destructive">{server.error}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {server.status === 'needs-auth' ? (
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void run(server, 'mcp-authenticate')}
                    >
                      {translate('components.native-chat.claudeControls.mcp.signIn', 'Sign in')}
                    </Button>
                  ) : null}
                  {server.status !== 'disabled' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void run(server, 'mcp-reconnect')}
                    >
                      {translate(
                        'components.native-chat.claudeControls.mcp.reconnect',
                        'Reconnect'
                      )}
                    </Button>
                  ) : null}
                  {server.status === 'connected' &&
                  (server.transport === 'http' || server.transport === 'sse') ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void run(server, 'mcp-clear-auth')}
                    >
                      {translate('components.native-chat.claudeControls.mcp.signOut', 'Sign out')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void run(server, 'mcp-toggle')}
                  >
                    {server.status === 'disabled'
                      ? translate('components.native-chat.claudeControls.mcp.enable', 'Enable')
                      : translate('components.native-chat.claudeControls.mcp.disable', 'Disable')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            {translate('components.native-chat.claudeControls.refresh', 'Refresh')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {translate('components.native-chat.claudeControls.close', 'Close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
