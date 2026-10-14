import type { ClaudeModsDispatch } from './claude-mods-draw-scope'
import { claudeModsPressQueueFor, type ClaudeModsActSite } from './claude-mods-press-queue'
import type { ClaudeModsNode } from './claude-mods-tree'
import type { ClaudeModsSitesTransport } from './claude-mods-transcript-sites'

/**
 * Presses, typing and picks of a drawn tree: they answer for this site, not for a pane.
 * `onRetired` runs when the CLI no longer knows the handle, so the tree on screen is stale;
 * `latest` is the site's newest tree, which a press on an older drawing heals against.
 */
export function claudeModsSiteDispatch(
  transport: Pick<ClaudeModsSitesTransport, 'request'>,
  component: string,
  instanceId: string,
  { onRetired, latest }: { onRetired: () => void; latest: () => ClaudeModsNode | undefined }
): ClaudeModsDispatch {
  const queue = claudeModsPressQueueFor(transport)
  const site: ClaudeModsActSite = { id: `${component}\0${instanceId}`, latest, onRetired }
  const fields = (key: string | undefined): Record<string, unknown> => ({
    ...(key ? { key } : {}),
    component,
    instance_id: instanceId
  })
  return {
    press: (press, key, href) => queue.press(site, press, key, href),
    input: (press, key, kind, value) =>
      queue.queue(site, 'ui_input', { press, key }, kind === 'change', {
        ...press,
        kind,
        value,
        ...fields(key)
      }),
    select: (press, key, value) =>
      void queue.queue(site, 'ui_select', { press, key }, false, {
        ...press,
        value,
        ...fields(key)
      })
  }
}
