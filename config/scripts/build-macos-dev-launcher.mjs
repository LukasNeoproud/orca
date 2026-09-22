import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { plistString } from './macos-dev-launcher.mjs'

if (process.platform !== 'darwin') {
  throw new Error('The Raycast launcher requires macOS.')
}
const repoRoot = path.resolve(import.meta.dirname, '../..')
const outputDir = path.join(repoRoot, 'out', 'macos-dev-launcher')
const appPath = path.join(outputDir, 'Orca Dev.app')
const contents = path.join(appPath, 'Contents')
const resources = path.join(contents, 'Resources')
const executable = path.join(contents, 'MacOS', 'Orca Dev')
mkdirSync(resources, { recursive: true })
mkdirSync(path.dirname(executable), { recursive: true })
const pnpmPath = execFileSync('/usr/bin/which', ['pnpm'], { encoding: 'utf8' }).trim()
const configurationPath = path.join(resources, 'launch.json')
writeFileSync(
  configurationPath,
  JSON.stringify(
    {
      repoRoot,
      nodePath: process.execPath,
      pnpmPath,
      searchPath: process.env.PATH ?? '/usr/bin:/bin'
    },
    null,
    2
  )
)
for (const name of ['macos-dev-launcher.mjs', 'dev-electron-bundle-cache.mjs']) {
  copyFileSync(path.join(repoRoot, 'config', 'scripts', name), path.join(resources, name))
}
execFileSync('/usr/bin/xcrun', [
  'clang',
  '-fobjc-arc',
  '-framework',
  'Foundation',
  path.join(repoRoot, 'config', 'scripts', 'macos-dev-launcher-main.m'),
  '-o',
  executable
])
writeFileSync(
  path.join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Orca Dev</string>
<key>CFBundleDisplayName</key><string>Orca Dev</string>
<key>CFBundleIdentifier</key><string>com.stablyai.orca.dev-launcher</string>
<key>CFBundleExecutable</key><string>Orca Dev</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>2</string>
<key>NSDocumentsFolderUsageDescription</key><string>Orca Dev needs access to its development repository in Documents to build and launch the app.</string>
<key>CFBundleIconFile</key><string>OrcaDev</string>
<key>LSUIElement</key><true/>
<key>NSHumanReadableCopyright</key>${plistString(`Launches development sources at ${repoRoot}`)}
</dict></plist>\n`
)
// The existing dev PNG is 256px, the native size of an ic08 PNG-backed ICNS element.
const icon = readFileSync(path.join(repoRoot, 'resources', 'icon-dev.png'))
const header = Buffer.alloc(16)
header.write('icns', 0)
header.writeUInt32BE(icon.length + 16, 4)
header.write('ic08', 8)
header.writeUInt32BE(icon.length + 8, 12)
writeFileSync(path.join(resources, 'OrcaDev.icns'), Buffer.concat([header, icon]))
execFileSync('/usr/bin/plutil', ['-lint', path.join(contents, 'Info.plist')])
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', appPath])
console.log(
  `Built ${appPath}\nCopy into ~/Applications and launch Orca Dev from Raycast. Rebuild after moving the repository or changing Node/pnpm installations.`
)
