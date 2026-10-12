import type { RpcClient } from '../transport/rpc-client'

/** APK installs are Android-only, so the web page never carries the APK transfer stack. */
export function MobileApkBuildPicker(_props: {
  visible: boolean
  client: RpcClient | null
  worktreeId: string
  onClose: () => void
}): null {
  return null
}
