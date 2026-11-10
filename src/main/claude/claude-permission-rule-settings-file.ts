import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  ClaudePermissionRuleBehavior,
  ClaudePermissionRuleFile
} from '../../shared/claude-session-control'
import { durableWriteTempPath, writeFileDurable } from '../durable-file-write'

// Permission rules live in Claude's own settings files, which the running CLI watches: a rule
// written here applies to the session without a restart, as one typed into /permissions does.

export type ClaudeSettingsFileLocations = { claudeConfigDir: string; cwd: string }

function settingsPath(file: ClaudePermissionRuleFile, at: ClaudeSettingsFileLocations): string {
  switch (file) {
    case 'userSettings':
      return join(at.claudeConfigDir, 'settings.json')
    case 'projectSettings':
      return join(at.cwd, '.claude', 'settings.json')
    case 'localSettings':
      return join(at.cwd, '.claude', 'settings.local.json')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readSettings(path: string): Promise<Record<string, unknown>> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
  const parsed: unknown = text.trim() ? JSON.parse(text) : {}
  if (!isRecord(parsed)) {
    // Never rewrite a file whose shape Orca does not understand.
    throw new Error('claude_settings_file_unreadable')
  }
  return parsed
}

/** Adds or removes one rule string, exactly as stored; true when the file changed. */
export async function editClaudePermissionRule(
  at: ClaudeSettingsFileLocations,
  edit: {
    action: 'add' | 'remove'
    file: ClaudePermissionRuleFile
    behavior: ClaudePermissionRuleBehavior
    rule: string
  }
): Promise<boolean> {
  const path = settingsPath(edit.file, at)
  const settings = await readSettings(path)
  const permissions = isRecord(settings.permissions) ? settings.permissions : {}
  const existing = Array.isArray(permissions[edit.behavior]) ? permissions[edit.behavior] : []
  const rules = (Array.isArray(existing) ? existing : []).filter(
    (value): value is string => typeof value === 'string'
  )
  const has = rules.includes(edit.rule)
  if ((edit.action === 'add') === has) {
    return false
  }
  const next =
    edit.action === 'add' ? [...rules, edit.rule] : rules.filter((rule) => rule !== edit.rule)
  await mkdir(dirname(path), { recursive: true })
  await writeFileDurable(
    durableWriteTempPath(path),
    path,
    `${JSON.stringify({ ...settings, permissions: { ...permissions, [edit.behavior]: next } }, null, 2)}\n`
  )
  return true
}
