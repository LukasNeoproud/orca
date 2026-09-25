import { StyleSheet, View } from 'react-native'
import { MobileEmulatorPane } from '../emulator/MobileEmulatorPane'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileLocalEmulatorTab } from './mobile-local-emulator-tab'

const styles = StyleSheet.create({
  pane: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0 },
  visible: { zIndex: 1 }
})

export function MobilePersistentEmulatorPanes({
  tabs,
  activeTabId,
  client,
  appActive
}: {
  tabs: readonly MobileLocalEmulatorTab[]
  activeTabId: string | null
  client: RpcClient | null
  appActive: boolean
}) {
  return tabs.map((tab) => {
    const visible = tab.id === activeTabId
    return (
      <View
        key={`${tab.scopeKey}:${tab.id}`}
        collapsable={false}
        style={[styles.pane, visible ? styles.visible : styles.hidden]}
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      >
        <MobileEmulatorPane
          client={client}
          device={tab.device}
          appActive={appActive}
          visible={visible}
        />
      </View>
    )
  })
}
