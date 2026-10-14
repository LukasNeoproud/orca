import {
  ClaudeModsTranscriptSites,
  type ClaudeModsSitesTransport
} from './claude-mods-transcript-sites'

const SITES = new WeakMap<object, ClaudeModsTranscriptSites>()

/** The one store of a chat's transcript sites, made on first use. */
export function claudeModsTranscriptSites(
  controller: ClaudeModsSitesTransport
): ClaudeModsTranscriptSites {
  let sites = SITES.get(controller)
  if (!sites) {
    sites = new ClaudeModsTranscriptSites(controller)
    SITES.set(controller, sites)
  }
  return sites
}
