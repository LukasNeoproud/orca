#!/usr/bin/env node
// Opens a visible test build of Orca with a structured Claude chat that has a set of Claude Code
// mods loaded: Anthropic's samples (token-weather, blast-radius, replay-theater) and Orca's test
// mods, plus a guide pane (/mods-demo). The window uses a throwaway profile, so the installed
// Orca and Orca Dev are untouched; the Claude CLI runs with your real home, i.e. your own sign-in.
//
//   pnpm demo:claude-mods                 build, then open the demo
//   pnpm demo:claude-mods --skip-build    reuse the last build in out/
//   pnpm demo:claude-mods --official <dir> use a local copy of claude-code-playground/claude-code/mods
//
// Close the window to end the demo. Mods run unsandboxed with your permissions, like in the
// terminal: read a mod's code before adding it.
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runProcessSync, spawnProcess } from '@orca/process-host'

const root = path.resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const argValue = (name) => {
  const index = args.indexOf(name)
  return index !== -1 ? args[index + 1] : undefined
}

if (process.platform === 'win32') {
  console.error('The mods demo launcher supports macOS and Linux.')
  process.exit(1)
}

const cache = path.join(os.tmpdir(), 'orca-claude-mods-demo')
mkdirSync(cache, { recursive: true })

function officialMods() {
  const given = argValue('--official')
  if (given) {
    return path.resolve(given)
  }
  const checkout = path.join(cache, 'claude-code-playground')
  const mods = path.join(checkout, 'claude-code', 'mods')
  if (!existsSync(mods)) {
    console.log("Fetching Anthropic's sample mods (claude-code-playground)…")
    const git = (gitArgs, cwd) => {
      const result = runProcessSync({ program: 'git', args: gitArgs, cwd, timeoutMs: 120_000 })
      if (result.code !== 0) {
        throw new Error(`git ${gitArgs.join(' ')} failed: ${result.stderr}`)
      }
    }
    git(
      [
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        'https://github.com/anthropics/claude-code-playground.git',
        checkout
      ],
      cache
    )
    git(['sparse-checkout', 'set', 'claude-code/mods'], checkout)
  }
  return mods
}

function realClaude() {
  const found = runProcessSync({
    program: 'sh',
    args: ['-c', 'command -v claude'],
    timeoutMs: 10_000
  })
  const resolved = found.stdout.trim()
  if (found.code !== 0 || !resolved) {
    throw new Error('Claude Code is not on PATH. Install it (2.1.287 or newer) and sign in first.')
  }
  return realpathSync(resolved)
}

// The test build isolates its home; only the Claude CLI it starts sees the real one.
function claudeShim(claude) {
  const bin = path.join(cache, 'bin')
  mkdirSync(bin, { recursive: true })
  const shim = path.join(bin, 'claude')
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
  writeFileSync(
    shim,
    `#!/bin/sh\nunset CLAUDE_CONFIG_DIR\nHOME=${quote(os.homedir())} exec ${quote(claude)} "$@"\n`
  )
  chmodSync(shim, 0o755)
  return bin
}

const official = officialMods()
const fixtures = path.join(root, 'tests', 'fixtures', 'claude-mods')
const plugins = [
  ...['token-weather', 'blast-radius', 'replay-theater'].map((name) => path.join(official, name)),
  ...[
    'mods-demo',
    'hello-tabs',
    'notes',
    'picker',
    'svg',
    'scroll-log',
    'client-board',
    'notify',
    'hover-card',
    'transcript-marks',
    'spinner-word'
  ].map((name) => path.join(fixtures, name))
]
for (const plugin of plugins) {
  if (!existsSync(path.join(plugin, '.claude-plugin', 'plugin.json'))) {
    throw new Error(`Not a plugin: ${plugin}`)
  }
}

const bin = claudeShim(realClaude())
console.log('Opening the Orca mods demo. Close the window to end it.')
const child = spawnProcess({
  program: 'npx',
  args: [
    'playwright',
    'test',
    'tests/e2e/claude-mods-demo.spec.ts',
    '--config',
    'tests/playwright.config.ts',
    '--project',
    'electron-headless',
    '--workers=1'
  ],
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ORCA_CLAUDE_MODS_DEMO: '1',
    ORCA_E2E_FORCE_HEADFUL: '1',
    CLAUDE_MODS_DEMO_BIN: bin,
    CLAUDE_MODS_DEMO_PLUGIN_DIRS: plugins.join(path.delimiter),
    ...(args.includes('--skip-build') ? { SKIP_BUILD: '1' } : {})
  }
})
child.on('exit', (code) => process.exit(code ?? 1))
