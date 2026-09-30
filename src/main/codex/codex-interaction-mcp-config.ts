import { join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { ORCA_INTERACTION_MCP_SERVER } from '../../shared/orca-interaction-elicitation'
import { ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME } from '../../shared/orcad-artifacts'

function interactionMcpLaunch(): { args: string[]; electronRunAsNode: boolean } {
  if (!hasAppEnvironment()) {
    return {
      args: [join(process.cwd(), 'out', 'cli', 'index.js'), 'interact', 'chat-mcp'],
      electronRunAsNode: true
    }
  }
  const app = getAppEnvironment()
  const appPath = app.getAppPath()
  const isAsarArchive = appPath.endsWith('.asar')
  const isAsarUnpacked = appPath.endsWith('.asar.unpacked')
  if (app.isPackaged() && !isAsarArchive && !isAsarUnpacked) {
    return {
      args: [join(appPath, ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME)],
      electronRunAsNode: false
    }
  }
  const cliRoot = isAsarArchive ? `${appPath}.unpacked` : appPath
  return {
    args: [join(cliRoot, 'out', 'cli', 'index.js'), 'interact', 'chat-mcp'],
    electronRunAsNode: true
  }
}

/** Resume cannot add dynamic tools; this bridge lives only in the app-server session config. */
export function codexInteractionMcpConfig(
  bridgeEnvironment: Readonly<Record<string, string>> = {}
): Record<string, unknown> {
  const launch = interactionMcpLaunch()
  return {
    [`mcp_servers.${ORCA_INTERACTION_MCP_SERVER}`]: {
      command: process.execPath,
      args: launch.args,
      env: {
        ...(launch.electronRunAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        ORCA_BACKGROUND_LAUNCH: '1',
        ...bridgeEnvironment
      },
      enabled: true,
      startup_timeout_sec: 10,
      tool_timeout_sec: 3600
    }
  }
}
