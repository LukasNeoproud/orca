import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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
  const options = { ref: 'HEAD', install: true, build: true }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--ref') {
      options.ref = argv[++index]
    } else if (argv[index] === '--no-install') {
      options.install = false
    } else if (argv[index] === '--install-only') {
      options.build = false
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

/** The Node bin dir for the major the checkout pins in `engines.node`: this one, or an nvm install. */
export function resolveBuildNodeBin(
  pinnedMajor,
  { currentVersion = process.versions.node, nvmRoot = path.join(homedir(), '.nvm') } = {}
) {
  if (currentVersion.split('.')[0] === pinnedMajor) {
    return path.dirname(process.execPath)
  }
  const versionsDir = path.join(nvmRoot, 'versions', 'node')
  const installed = existsSync(versionsDir)
    ? readdirSync(versionsDir).filter((name) => name.startsWith(`v${pinnedMajor}.`))
    : []
  const collator = new Intl.Collator(undefined, { numeric: true })
  const newest = installed.sort((a, b) => collator.compare(b, a))[0]
  if (!newest) {
    throw new Error(
      `Orca builds need Node ${pinnedMajor}; install it with \`nvm install ${pinnedMajor}\`.`
    )
  }
  return path.join(versionsDir, newest, 'bin')
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
  const { engines } = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8'))
  const nodeBin = resolveBuildNodeBin(String(engines.node).match(/\d+/)[0])
  // Why CSC_NAME for every step: the native helpers are signed while they build, before packaging.
  const env = {
    ...process.env,
    PATH: `${nodeBin}:${process.env.PATH}`,
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
      `--config.directories.output=${outputDir}`,
      // Why: the installed Electron is the exact version; a GitHub download can stall for minutes.
      `--config.electronDist=${path.join(sourceDir, 'node_modules', 'electron', 'dist')}`
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

function waitForOrcaDevExit(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (isOrcaDevRunning(installedApp)) {
    if (Date.now() > deadline) {
      return false
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  return true
}

/**
 * Quits Orca Dev; its terminals live in the daemon and survive. Asked like Cmd+Q first, without
 * waiting on the answer: a confirmation dialog (running terminals) would hold that answer forever.
 * SIGTERM then quits it without the dialog.
 */
function quitOrcaDev() {
  run('/usr/bin/osascript', [
    '-e',
    'ignoring application responses\ntell application id "com.stablyai.orca.dev" to quit\nend ignoring'
  ])
  if (waitForOrcaDevExit(10_000)) {
    return
  }
  const executable = path.join(installedApp, 'Contents', 'MacOS', 'Orca Dev')
  run('/usr/bin/pkill', ['-TERM', '-x', '-f', executable])
  if (!waitForOrcaDevExit(60_000)) {
    throw new Error('Orca Dev did not quit within a minute; the new build is not installed.')
  }
}

function install(builtApp) {
  if (!existsSync(builtApp)) {
    throw new Error(`No built Orca Dev at ${builtApp}; run without --install-only first.`)
  }
  run('codesign', ['--verify', '--deep', '--strict', builtApp])
  const wasRunning = isOrcaDevRunning(installedApp)
  if (wasRunning) {
    console.log('[orca-dev] Quitting Orca Dev to install the new build.')
    quitOrcaDev()
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
  // Why outside ~/Applications: launchers like Raycast index any .app there, even mid-install.
  const staged = path.join(cacheRoot, 'Orca Dev.app')
  rmSync(staged, { recursive: true, force: true })
  run('/usr/bin/ditto', [builtApp, staged])
  rmSync(installedApp, { recursive: true, force: true })
  renameSync(staged, installedApp)
  if (wasRunning) {
    run('/usr/bin/open', ['-a', installedApp])
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  if (process.platform !== 'darwin') {
    throw new Error('Orca Dev builds are macOS only.')
  }
  const options = parseArguments(process.argv.slice(2))
  if (!options.build) {
    install(path.join(outputDir, `mac-${process.arch}`, 'Orca Dev.app'))
    console.log(`[orca-dev] Installed the last build into ${installedApp}`)
    process.exit(0)
  }
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
