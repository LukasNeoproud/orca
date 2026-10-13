// Substituted by the electron-vite main and renderer builds only; CLI, relay and mobile leave it.
declare const ORCA_LOCAL_DEV_BUILD: boolean | undefined

/** A packaged Orca Dev build (config/scripts/build-orca-dev-app.mjs); false in every other bundle. */
export function isLocalDevBuild(): boolean {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- a direct read throws where it is unsubstituted.
  return typeof ORCA_LOCAL_DEV_BUILD !== 'undefined' && ORCA_LOCAL_DEV_BUILD === true
}
