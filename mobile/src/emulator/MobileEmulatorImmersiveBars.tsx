import type { ComponentType } from 'react'
import { Platform, StatusBar, type ViewProps } from 'react-native'
import { requireNativeViewManager } from 'expo-modules-core'
import { nativeEmulatorVideo } from '@orca/expo-emulator-video'

const AndroidImmersiveView: ComponentType<ViewProps> | null =
  Platform.OS === 'android' && nativeEmulatorVideo?.supportsImmersiveWindow
    ? requireNativeViewManager('ExpoEmulatorVideo', 'EmulatorImmersiveView')
    : null

export function MobileEmulatorImmersiveBars() {
  return (
    <>
      <StatusBar hidden />
      {AndroidImmersiveView ? (
        <AndroidImmersiveView
          pointerEvents="none"
          style={{ position: 'absolute', width: 1, height: 1 }}
        />
      ) : null}
    </>
  )
}
