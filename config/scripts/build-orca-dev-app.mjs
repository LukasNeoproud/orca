import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createLocalBuildVersion } from './build-mac-local.mjs'
import { DEV_SIGNING_IDENTITY, ensureDevSigningIdentity } from './macos-dev-signing-identity.mjs'

// Builds Orca Dev from a commit in a private clone and installs it into ~/Applications, so the
// running app depends on neither the working tree nor a dev server.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const cacheRoot = path.join(homedir(), 'Library', 'Caches', 'Orca Dev Build')
const sourceDir = path.join(cacheRoot, 'source')
const outputDir = path.join(cacheRoot, 'dist')
const installedApp = path.join(homedir(), 'Applications', 'Orca Dev.app')
const backupDir = path.join(
  homedir(),
  'Library',
  'Application Support',
  'Orca Dev Launcher Backups'
)

const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options })
const read = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', ...options }).trim()

export function parseArguments(argv) {
  const options = { ref: 'HEAD', install: true }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--ref') {
      options.ref = argv[++index]
    } else if (argv[index] === '--no-install') {
      options.install = false
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`)
    }
  }
  if (!options.ref) {
    throw new Error('--ref needs a commit, branch or tag.')
  }
  return options
}

/** One PNG-backed `ic08` element: the dev icon is 256px, that element's native size. */
export function devIconIcns(png) {
  const header = Buffer.alloc(16)
  header.write('icns', 0)
  header.writeUInt32BE(png.length + 16, 4)
  header.write('ic08', 8)
  header.writeUInt32BE(png.length + 8, 12)
  return Buffer.concat([header, png])
}

export function isOrcaDevRunning(
  appPath,
  readProcesses = () => read('/bin/ps', ['-axo', 'command'])
) {
  const executable = path.join(appPath, 'Contents', 'MacOS', 'Orca Dev')
  return readProcesses()
    .split('\n')
    .some((line) => line.startsWith(executable))
}

function prepareSource(commit) {
  if (!existsSync(path.join(sourceDir, '.git'))) {
    mkdirSync(cacheRoot, { recursive: true })
    run('git', ['clone', '--no-checkout', repoRoot, sourceDir])
  }
  run('git', ['-C', sourceDir, 'fetch', '--quiet', repoRoot, commit])
  run('git', ['-C', sourceDir, 'checkout', '--quiet', '--force', '--detach', commit])
  // Ignored files stay: node_modules and native build caches make the next build incremental.
  run('git', ['-C', sourceDir, 'clean', '-ffd', '--quiet'])
}

function build(commit) {
  // Why CSC_NAME for every step: the native helpers are signed while they build, before packaging.
  const env = {
    ...process.env,
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_SKIP_DEV_CLI_SYMLINK: '1',
    CSC_NAME: DEV_SIGNING_IDENTITY
  }
  run('pnpm', ['install', '--frozen-lockfile'], { cwd: sourceDir, env })
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: path.join(sourceDir, 'mobile'),
    env
  })
  for (const script of [
    'build:desktop',
    'build:computer-macos',
    'build:keyboard-layout-macos',
    'build:notification-status-macos',
    'ensure:electron-runtime'
  ]) {
    run('pnpm', ['run', script], {
      cwd: sourceDir,
      env: { ...env, ORCA_LOCAL_DEV_BUILD: '1' }
    })
  }
  const icon = path.join(cacheRoot, 'OrcaDev.icns')
  writeFileSync(icon, devIconIcns(readFileSync(path.join(sourceDir, 'resources', 'icon-dev.png'))))
  const { version } = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8'))
  rmSync(outputDir, { recursive: true, force: true })
  run(
    'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      'dir',
      `--${process.arch}`,
      `--config.directories.output=${outputDir}`
    ],
    {
      cwd: sourceDir,
      env: {
        ...env,
        ORCA_LOCAL_DEV_BUILD: '1',
        ORCA_LOCAL_DEV_ICON: icon,
        ORCA_BUILD_COMMIT: commit.slice(0, 12),
        ORCA_LOCAL_BUILD_VERSION: createLocalBuildVersion(version, Date.now(), commit)
      }
    }
  )
  const builtApp = path.join(outputDir, `mac-${process.arch}`, 'Orca Dev.app')
  run('codesign', ['--verify', '--deep', '--strict', builtApp])
  // codesign prints the signature description on stderr.
  const signature = spawnSync('codesign', ['-dv', '--verbose=2', builtApp], {
    encoding: 'utf8'
  })
  if (!signature.stderr.includes(`Authority=${DEV_SIGNING_IDENTITY}`)) {
    throw new Error(`${builtApp} is not signed by ${DEV_SIGNING_IDENTITY}:\n${signature.stderr}`)
  }
  return builtApp
}

function install(builtApp) {
  if (isOrcaDevRunning(installedApp)) {
    throw new Error(`Quit Orca Dev first; the new build stays at ${builtApp}.`)
  }
  if (existsSync(installedApp)) {
    // The old Raycast launcher is a tiny wrapper, not Electron; keep it once in case of rollback.
    if (!existsSync(path.join(installedApp, 'Contents', 'Frameworks'))) {
      mkdirSync(backupDir, { recursive: true })
      run('/usr/bin/ditto', [
        installedApp,
        path.join(backupDir, `Orca Dev launcher ${Date.now()}.app`)
      ])
    }
  }
  const staged = `${installedApp}.installing`
  rmSync(staged, { recursive: true, force: true })
  run('/usr/bin/ditto', [builtApp, staged])
  rmSync(installedApp, { recursive: true, force: true })
  renameSync(staged, installedApp)
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.platform !== 'darwin') {
    throw new Error('Orca Dev builds are macOS only.')
  }
  const options = parseArguments(process.argv.slice(2))
  const commit = read('git', ['-C', repoRoot, 'rev-parse', '--verify', `${options.ref}^{commit}`])
  if (read('git', ['-C', repoRoot, 'status', '--porcelain'])) {
    console.warn('[orca-dev] Uncommitted changes are not part of this build.')
  }
  ensureDevSigningIdentity()
  console.log(`[orca-dev] Building ${commit.slice(0, 12)} in ${sourceDir}`)
  prepareSource(commit)
  const builtApp = build(commit)
  if (options.install) {
    install(builtApp)
    console.log(`[orca-dev] Installed ${installedApp} (${commit.slice(0, 12)})`)
  } else {
    console.log(`[orca-dev] Built ${builtApp}`)
  }
}
