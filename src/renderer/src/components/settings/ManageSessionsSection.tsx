import { useState } from 'react'
import { ArrowRight, LoaderCircle, RotateCw, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { SearchableSetting } from './SearchableSetting'
import { getManageSessionsSearchEntries } from './terminal-search'
import { useDaemonActions, DaemonActionDialog } from '../shared/useDaemonActions'
import { notifyDaemonSessionInventoryInvalidated } from '../status-bar/daemon-session-inventory-invalidation'
import {
  MANAGE_SESSIONS_SECTION_ID,
  TerminalTccAttributionNotice
} from './TerminalTccAttributionNotice'
import { Button } from '../ui/button'

export function ManageSessionsSection(): React.JSX.Element {
  const [attributionRefreshRevision, setAttributionRefreshRevision] = useState(0)
  const openAgentManager = useAppStore((state) => state.openAgentManager)
  const daemonActions = useDaemonActions({
    onKillAllSettled: notifyDaemonSessionInventoryInvalidated,
    onRestartSettled: () => {
      notifyDaemonSessionInventoryInvalidated()
      setAttributionRefreshRevision((revision) => revision + 1)
    }
  })

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {translate(
            'auto.components.settings.ManageSessionsSection.d1b80fd5cd',
            'Manage Sessions'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'agents.manager.settingsDescription',
            'Inspect active agents and terminals, then jump directly to the workspace that owns them.'
          )}
        </p>
      </div>

      <SearchableSetting
        title={getManageSessionsSearchEntries()[0].title}
        description={getManageSessionsSearchEntries()[0].description}
        keywords={getManageSessionsSearchEntries()[0].keywords}
        className="space-y-3"
        id={MANAGE_SESSIONS_SECTION_ID}
      >
        <TerminalTccAttributionNotice
          showManageSessionsButton={false}
          refreshRevision={attributionRefreshRevision}
        />
        <Button variant="outline" size="sm" onClick={openAgentManager}>
          {translate('agents.manager.open', 'Open agents and terminals')}
          <ArrowRight />
        </Button>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">
              {translate('agents.manager.advancedControls', 'Advanced daemon controls')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate(
                'agents.manager.advancedControlsDescription',
                'Use these recovery actions only when terminal sessions are frozen or misbehaving.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={daemonActions.isBusy}
              onClick={() => daemonActions.setPending('killAll')}
            >
              {daemonActions.busyKind === 'killAll' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              {translate(
                'auto.components.settings.ManageSessionsSection.3282db098c',
                'Kill all sessions'
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={daemonActions.isBusy}
              onClick={() => daemonActions.setPending('restart')}
            >
              {daemonActions.busyKind === 'restart' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RotateCw />
              )}
              {translate(
                'auto.components.settings.ManageSessionsSection.5ed15e778c',
                'Restart daemon'
              )}
            </Button>
          </div>
        </div>
      </SearchableSetting>

      <DaemonActionDialog api={daemonActions} />
    </section>
  )
}
