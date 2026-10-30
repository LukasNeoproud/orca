import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import { orcaLaunchCliCommand } from '../../../shared/terminal-interaction-launch'
import { durableWriteTempPath, writeFileDurableSync } from '../../durable-file-write'
import { buildAzureDevOpsReviewPiExtensionSource } from './azure-devops-review-pi-extension-source'

const EXTENSION_DIR = 'pi-review-extension'
const EXTENSION_FILE = 'orca-ado-review-tools.ts'

/**
 * Writes the Pi extension a review agent loads with `--extension` and returns its path, or null
 * when it cannot be written. Outside Pi's extension folders, so only review launches load it.
 */
export function writeAzureDevOpsReviewPiExtension(directory: string, cli: string): string | null {
  const path = join(directory, EXTENSION_FILE)
  const source = buildAzureDevOpsReviewPiExtensionSource(cli)
  try {
    if (readFileSync(path, 'utf8') === source) {
      return path
    }
  } catch {
    // Missing or unreadable: write it below.
  }
  try {
    mkdirSync(directory, { recursive: true })
    // Why atomic: a review agent starting meanwhile must never load half a file.
    writeFileDurableSync(durableWriteTempPath(path), path, source)
    return path
  } catch {
    return null
  }
}

/** This build's extension, calling the CLI its own terminals expose (`orca-dev` in dev). */
export function ensureAzureDevOpsReviewPiExtension(): string | null {
  const app = getAppEnvironment()
  return writeAzureDevOpsReviewPiExtension(
    join(app.getPath('userData'), EXTENSION_DIR),
    orcaLaunchCliCommand(process.platform, !app.isPackaged())
  )
}
