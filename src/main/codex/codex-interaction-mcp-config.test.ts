import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME,
  orcadArtifactFilenames
} from '../../shared/orcad-artifacts'
import { codexInteractionMcpConfig } from './codex-interaction-mcp-config'

const host = vi.hoisted(() => ({ appPath: '/host/orca', packaged: false }))
vi.mock('../../shared/app-environment', () => ({
  hasAppEnvironment: () => true,
  getAppEnvironment: () => ({
    getAppPath: () => host.appPath,
    isPackaged: () => host.packaged
  })
}))

describe('session-scoped Codex interaction MCP config', () => {
  it.each([
    {
      name: 'desktop development',
      appPath: '/host/orca',
      packaged: false,
      args: [join('/host/orca', 'out', 'cli', 'index.js'), 'interact', 'chat-mcp'],
      env: { ELECTRON_RUN_AS_NODE: '1', ORCA_BACKGROUND_LAUNCH: '1' }
    },
    {
      name: 'packaged desktop',
      appPath: '/host/Orca App/resources/app.asar',
      packaged: true,
      args: [
        join('/host/Orca App/resources/app.asar.unpacked', 'out', 'cli', 'index.js'),
        'interact',
        'chat-mcp'
      ],
      env: { ELECTRON_RUN_AS_NODE: '1', ORCA_BACKGROUND_LAUNCH: '1' }
    },
    {
      name: 'already-unpacked desktop',
      appPath: '/host/Orca App/resources/app.asar.unpacked',
      packaged: true,
      args: [
        join('/host/Orca App/resources/app.asar.unpacked', 'out', 'cli', 'index.js'),
        'interact',
        'chat-mcp'
      ],
      env: { ELECTRON_RUN_AS_NODE: '1', ORCA_BACKGROUND_LAUNCH: '1' }
    },
    {
      name: 'headless orcad',
      appPath: '/host/orcad',
      packaged: true,
      args: [join('/host/orcad', ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME)],
      env: { ORCA_BACKGROUND_LAUNCH: '1' }
    },
    {
      name: 'headless orcad below an app.asar-named directory',
      appPath: '/host/app.asar-cache/orcad',
      packaged: true,
      args: [join('/host/app.asar-cache/orcad', ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME)],
      env: { ORCA_BACKGROUND_LAUNCH: '1' }
    }
  ])('uses this $name host bundle, not PATH', ({ appPath, packaged, args, env }) => {
    host.appPath = appPath
    host.packaged = packaged
    expect(codexInteractionMcpConfig()).toEqual({
      'mcp_servers.orca_interactive_chat': {
        command: process.execPath,
        args,
        env,
        enabled: true,
        startup_timeout_sec: 10,
        tool_timeout_sec: 3600
      }
    })
  })

  it('declares the headless bridge as a required hashed deployment artifact', () => {
    expect(orcadArtifactFilenames('linux-x64-glibc')).toContain(
      ORCAD_STRUCTURED_INTERACTION_MCP_FILENAME
    )
  })

  it('scopes the host-owned socket credentials to the interaction MCP process', () => {
    const config = codexInteractionMcpConfig({
      ORCA_INTERACTION_SOCKET: '/private/orca/socket',
      ORCA_INTERACTION_TOKEN: 'secret-token'
    }) as Record<string, { env: Record<string, string> }>

    expect(config['mcp_servers.orca_interactive_chat']?.env).toMatchObject({
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_INTERACTION_SOCKET: '/private/orca/socket',
      ORCA_INTERACTION_TOKEN: 'secret-token'
    })
  })
})
