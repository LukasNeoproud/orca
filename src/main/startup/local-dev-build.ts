/** A packaged Orca Dev build (config/scripts/build-orca-dev-app.mjs); false in every other bundle. */
export function isLocalDevBuild(): boolean {
  // Why typeof: only the electron-vite main build defines the constant; other bundles may reach here.
  return typeof ORCA_LOCAL_DEV_BUILD !== 'undefined' && ORCA_LOCAL_DEV_BUILD
}
