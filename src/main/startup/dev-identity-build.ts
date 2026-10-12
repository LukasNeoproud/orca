import { is } from '@electron-toolkit/utils'
import { isLocalDevBuild } from './local-dev-build'

/**
 * Dev data, Keychain name, CLI and no auto-update. True for `pnpm dev` and for a packaged Orca Dev
 * build, which keeps that identity while loading its packaged files instead of a dev server.
 */
export function hasDevIdentity(): boolean {
  return is.dev || isLocalDevBuild()
}
