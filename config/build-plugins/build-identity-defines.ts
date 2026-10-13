import { resolveBuildSourceCommit } from '../scripts/build-source-commit.mjs'

/** Build identity substituted into the main and renderer bundles. */
export function buildIdentityDefines(): Record<string, string> {
  return {
    // Why: official skill installs pin to the commit the build came from, so they match the
    // bundled skills on every channel. Main runs the installer; the renderer prints the command.
    ORCA_BUILD_COMMIT: JSON.stringify(resolveBuildSourceCommit()),
    // Why: a packaged Orca Dev (config/scripts/build-orca-dev-app.mjs) keeps the dev identity.
    ORCA_LOCAL_DEV_BUILD: JSON.stringify(process.env.ORCA_LOCAL_DEV_BUILD === '1')
  }
}
