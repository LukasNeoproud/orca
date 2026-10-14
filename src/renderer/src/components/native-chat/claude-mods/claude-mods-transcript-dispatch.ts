import type { ClaudeModsDispatch } from './claude-mods-draw-scope'
import type { ClaudeModsSitesTransport } from './claude-mods-transcript-sites'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Presses, typing and picks of a drawn tree: they answer for this site, not for a pane.
 * `onRetired` runs when the CLI no longer knows the handle, so the tree on screen is stale.
 */
export function claudeModsSiteDispatch(
  transport: Pick<ClaudeModsSitesTransport, 'request'>,
  component: string,
  instanceId: string,
  onRetired: () => void
): ClaudeModsDispatch {
  const act = async (
    subtype: 'ui_press' | 'ui_input' | 'ui_select',
    fields: Record<string, unknown>
  ): Promise<void> => {
    const answer = await transport.request(subtype, fields)
    if (isRecord(answer) && answer.handled === false) {
      onRetired()
    }
  }
  return {
    press: (press, key, href) =>
      void act('ui_press', { ...press, ...(key ? { key } : {}), ...(href ? { href } : {}) }),
    input: (press, key, kind, value) =>
      act('ui_input', {
        ...press,
        kind,
        value,
        ...(key ? { key } : {}),
        component,
        instance_id: instanceId
      }),
    select: (press, key, value) =>
      void act('ui_select', {
        ...press,
        value,
        ...(key ? { key } : {}),
        component,
        instance_id: instanceId
      })
  }
}
