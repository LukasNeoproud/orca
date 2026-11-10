import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindClaudeSessionControls, runClaudeSessionControl } from './claude-session-controls'

const folders: string[] = []
async function folder(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'orca-claude-controls-'))
  folders.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function bound(answers: Record<string, unknown>, files = { claudeConfigDir: '/c', cwd: '/w' }) {
  const rawRequest = vi.fn(async (body: Record<string, unknown>) => answers[String(body.subtype)])
  const unbind = bindClaudeSessionControls('s1', { rawRequest }, files)
  return { rawRequest, unbind }
}

describe('a Claude chat’s out-of-turn controls', () => {
  it('refuses when no child runs for the chat, and again once its child is gone', async () => {
    await expect(runClaudeSessionControl('s0', { kind: 'mcp-status' })).rejects.toThrow(
      'claude_session_not_running'
    )
    const { unbind } = bound({ mcp_status: { mcpServers: [] } })
    await expect(runClaudeSessionControl('s1', { kind: 'mcp-status' })).resolves.toEqual({
      servers: []
    })
    unbind()
    await expect(runClaudeSessionControl('s1', { kind: 'mcp-status' })).rejects.toThrow(
      'claude_session_not_running'
    )
  })

  it('reads the server list, dropping entries it cannot name or place', async () => {
    const { unbind } = bound({
      mcp_status: {
        mcpServers: [
          {
            name: 'docs',
            status: 'connected',
            scope: 'user',
            transport: 'http',
            tools: [{ name: 'search' }, { name: 'read' }]
          },
          { name: 'broken', status: 'failed', error: 'ECONNREFUSED', config: { type: 'stdio' } },
          { name: 'odd', status: 'teleporting' },
          { status: 'connected' }
        ]
      }
    })
    const { servers } = await runClaudeSessionControl('s1', { kind: 'mcp-status' })
    expect(servers).toEqual([
      {
        name: 'docs',
        status: 'connected',
        scope: 'user',
        transport: 'http',
        tools: ['search', 'read']
      },
      { name: 'broken', status: 'failed', error: 'ECONNREFUSED', transport: 'stdio' }
    ])
    unbind()
  })

  it('names the server in the wire request, and hands back only a web sign-in link', async () => {
    const { rawRequest, unbind } = bound({ mcp_authenticate: { authUrl: 'file:///etc/passwd' } })
    await runClaudeSessionControl('s1', { kind: 'mcp-toggle', server: 'docs', enabled: false })
    expect(rawRequest).toHaveBeenLastCalledWith({
      subtype: 'mcp_toggle',
      serverName: 'docs',
      enabled: false
    })
    await expect(
      runClaudeSessionControl('s1', { kind: 'mcp-authenticate', server: 'docs' })
    ).resolves.toEqual({})
    unbind()
  })

  it('lists permission rules with the CLI’s reading of each', async () => {
    const { unbind } = bound({
      list_permission_rules: {
        state: {
          rules: [
            {
              behavior: 'allow',
              source: 'localSettings',
              rule: 'Bash(git status*)',
              editability: 'persistent',
              description: { prefix: 'The Bash command ', emphasis: 'git status*' }
            },
            { behavior: 'maybe', rule: 'x' }
          ],
          workspaceDirectories: [{ path: '/extra', source: 'cliArg' }],
          originalCwd: '/w',
          managedOnly: false
        }
      }
    })
    await expect(runClaudeSessionControl('s1', { kind: 'permission-rules' })).resolves.toEqual({
      rules: [
        {
          behavior: 'allow',
          source: 'localSettings',
          rule: 'Bash(git status*)',
          editability: 'persistent',
          description: 'The Bash command git status*'
        }
      ],
      workspaceDirectories: [{ path: '/extra', source: 'cliArg' }],
      originalCwd: '/w',
      managedOnly: false
    })
    unbind()
  })

  it('adds and removes a rule in the settings file it belongs to, keeping the rest of the file', async () => {
    const cwd = await folder()
    const claudeConfigDir = await folder()
    await writeFile(
      join(claudeConfigDir, 'settings.json'),
      JSON.stringify({ model: 'opus', permissions: { allow: ['Read'], deny: ['WebFetch'] } })
    )
    const { unbind } = bound({}, { claudeConfigDir, cwd })
    const edit = (action: 'add' | 'remove', file: 'userSettings' | 'localSettings', rule: string) =>
      runClaudeSessionControl('s1', {
        kind: 'permission-rule-edit',
        action,
        file,
        behavior: 'allow',
        rule
      })
    await expect(edit('add', 'userSettings', 'Bash(ls:*)')).resolves.toEqual({ changed: true })
    await expect(edit('add', 'userSettings', 'Bash(ls:*)')).resolves.toEqual({ changed: false })
    await expect(edit('remove', 'userSettings', 'Read')).resolves.toEqual({ changed: true })
    expect(JSON.parse(await readFile(join(claudeConfigDir, 'settings.json'), 'utf8'))).toEqual({
      model: 'opus',
      permissions: { allow: ['Bash(ls:*)'], deny: ['WebFetch'] }
    })
    // A project that has no settings file yet gets one.
    await edit('add', 'localSettings', 'Edit')
    expect(JSON.parse(await readFile(join(cwd, '.claude', 'settings.local.json'), 'utf8'))).toEqual(
      { permissions: { allow: ['Edit'] } }
    )
    unbind()
  })

  it('never rewrites a settings file it cannot read as an object', async () => {
    const claudeConfigDir = await folder()
    await writeFile(join(claudeConfigDir, 'settings.json'), '["not", "settings"]')
    const { unbind } = bound({}, { claudeConfigDir, cwd: await folder() })
    await expect(
      runClaudeSessionControl('s1', {
        kind: 'permission-rule-edit',
        action: 'add',
        file: 'userSettings',
        behavior: 'deny',
        rule: 'Bash'
      })
    ).rejects.toThrow('claude_settings_file_unreadable')
    expect(await readFile(join(claudeConfigDir, 'settings.json'), 'utf8')).toBe(
      '["not", "settings"]'
    )
    unbind()
  })
})
