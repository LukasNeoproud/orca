import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, View, Text, Pressable, type AppStateStatus } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import type Animated from 'react-native-reanimated'
import type { AnimatedRef, SharedValue } from 'react-native-reanimated'
import { CustomKeyModal, loadCustomKeys, saveCustomKeys, type CustomKey } from './CustomKeyModal'
import { DragReorderList } from './DragReorderList'
import { AccessoryRow, type AccessoryItem } from './TerminalShortcutSettingsRow'
import { colors } from '../theme/mobile-theme'
import { styles } from './TerminalShortcutSettings.styles'
import { TERMINAL_ACCESSORY_KEYS } from '../terminal/terminal-accessory-keys'
import {
  createTerminalAccessoryLayoutPreference,
  getDefaultTerminalAccessoryLayout,
  loadTerminalAccessoryLayout,
  moveTerminalAccessoryKey,
  saveTerminalAccessoryLayout,
  setTerminalAccessoryBuiltInVisible,
  setTerminalAccessoryRowCount,
  type TerminalAccessoryLayout
} from '../terminal/terminal-accessory-layout'

const REORDER_ROW_HEIGHT = 56

type Props = {
  scrollRef: AnimatedRef<Animated.ScrollView>
  scrollOffsetY: SharedValue<number>
  scrollContentHeight: SharedValue<number>
  onDragActiveChange: (active: boolean) => void
}

export function TerminalShortcutSettings({
  scrollRef,
  scrollOffsetY,
  scrollContentHeight,
  onDragActiveChange
}: Props): React.JSX.Element {
  const [customKeys, setCustomKeys] = useState<CustomKey[]>([])
  const [showCustomKeyModal, setShowCustomKeyModal] = useState(false)
  const [shortcutLayout, setShortcutLayout] = useState<TerminalAccessoryLayout>(
    getDefaultTerminalAccessoryLayout
  )
  const shortcutLayoutRef = useRef(shortcutLayout)
  const [activeDragRow, setActiveDragRow] = useState<number | null>(null)
  const rowTargetsRef = useRef<Map<number, View>>(new Map())
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())
  const writeSeqRef = useRef(0)
  const pendingWritesRef = useRef(0)
  const customKeyIds = useMemo(() => customKeys.map((key) => key.id), [customKeys])

  const persist = useCallback((layout: TerminalAccessoryLayout, keys: CustomKey[]) => {
    writeSeqRef.current += 1
    pendingWritesRef.current += 1
    writeChainRef.current = writeChainRef.current
      .catch(() => {})
      .then(() =>
        saveTerminalAccessoryLayout(
          layout,
          keys.map((key) => key.id)
        )
      )
      .catch(() => {})
      .finally(() => {
        pendingWritesRef.current -= 1
      })
  }, [])

  const refresh = useCallback(() => {
    const seq = writeSeqRef.current
    void loadCustomKeys().then(async (keys) => {
      const layout = await loadTerminalAccessoryLayout(keys.map((key) => key.id))
      if (pendingWritesRef.current > 0 || seq !== writeSeqRef.current) {
        return
      }
      setCustomKeys(keys)
      shortcutLayoutRef.current = layout
      setShortcutLayout(layout)
    })
  }, [])

  useFocusEffect(useCallback(() => refresh(), [refresh]))
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        refresh()
      }
    })
    return () => sub.remove()
  }, [refresh])

  const toggleBuiltInKey = useCallback(
    (id: string, visible: boolean) => {
      const next = setTerminalAccessoryBuiltInVisible(
        shortcutLayoutRef.current,
        id,
        visible,
        undefined,
        customKeyIds
      )
      shortcutLayoutRef.current = next
      setShortcutLayout(next)
      persist(next, customKeys)
    },
    [customKeyIds, customKeys, persist]
  )

  const setRowCount = useCallback(
    (count: 1 | 2 | 3) => {
      const next = setTerminalAccessoryRowCount(
        shortcutLayoutRef.current,
        count,
        undefined,
        customKeyIds
      )
      shortcutLayoutRef.current = next
      setShortcutLayout(next)
      persist(next, customKeys)
    },
    [customKeyIds, customKeys, persist]
  )

  const moveKey = useCallback(
    (id: string, targetRow: number, targetIndex: number) => {
      const next = moveTerminalAccessoryKey(
        shortcutLayoutRef.current,
        id,
        targetRow,
        targetIndex,
        undefined,
        customKeyIds
      )
      shortcutLayoutRef.current = next
      setShortcutLayout(next)
      persist(next, customKeys)
    },
    [customKeyIds, customKeys, persist]
  )

  const reorderRow = useCallback(
    (rowIndex: number, orderedKeys: string[]) => {
      const current = shortcutLayoutRef.current
      if (orderedKeys.join('\u0000') === current.rows[rowIndex]?.join('\u0000')) {
        return
      }
      const rows = current.rows.map((row, index) => (index === rowIndex ? orderedKeys : row))
      const next = createTerminalAccessoryLayoutPreference(
        { rows, visibleBuiltInIds: current.visibleBuiltInIds },
        undefined,
        customKeyIds
      )
      shortcutLayoutRef.current = next
      setShortcutLayout(next)
      persist(next, customKeys)
    },
    [customKeyIds, customKeys, persist]
  )

  const handleDrop = useCallback(
    (sourceRow: number, id: string, absoluteY: number, orderedKeys: string[]) => {
      const targets = [...rowTargetsRef.current.entries()]
      void Promise.all(
        targets.map(
          ([rowIndex, view]) =>
            new Promise<{ rowIndex: number; y: number; height: number }>((resolve) => {
              view.measureInWindow((_x, y, _width, height) => resolve({ rowIndex, y, height }))
            })
        )
      ).then((bounds) => {
        const target = bounds.find(
          ({ y, height }) => absoluteY >= y - 16 && absoluteY <= y + height + 16
        )
        if (!target || target.rowIndex === sourceRow) {
          reorderRow(sourceRow, orderedKeys)
          return
        }
        const targetIndex = Math.round((absoluteY - target.y) / REORDER_ROW_HEIGHT)
        moveKey(id, target.rowIndex, targetIndex)
      })
    },
    [moveKey, reorderRow]
  )

  const handleDeleteCustomKey = useCallback(
    (key: CustomKey) => {
      const updated = customKeys.filter((item) => item.id !== key.id)
      const next = createTerminalAccessoryLayoutPreference(
        shortcutLayoutRef.current,
        undefined,
        updated.map((item) => item.id)
      )
      setCustomKeys(updated)
      shortcutLayoutRef.current = next
      setShortcutLayout(next)
      writeSeqRef.current += 1
      pendingWritesRef.current += 1
      writeChainRef.current = writeChainRef.current
        .catch(() => {})
        .then(async () => {
          await saveCustomKeys(updated)
          await saveTerminalAccessoryLayout(
            next,
            updated.map((item) => item.id)
          )
        })
        .catch(() => {})
        .finally(() => {
          pendingWritesRef.current -= 1
        })
    },
    [customKeys]
  )

  const reset = useCallback(() => {
    const next = createTerminalAccessoryLayoutPreference(
      getDefaultTerminalAccessoryLayout(),
      undefined,
      customKeyIds
    )
    setShortcutLayout(next)
    shortcutLayoutRef.current = next
    persist(next, customKeys)
  }, [customKeyIds, customKeys, persist])

  const visibleBuiltInSet = useMemo(
    () => new Set(shortcutLayout.visibleBuiltInIds),
    [shortcutLayout.visibleBuiltInIds]
  )
  const itemsById = useMemo(() => {
    const items = new Map<string, AccessoryItem>()
    for (const key of TERMINAL_ACCESSORY_KEYS) {
      items.set(key.id, { kind: 'built-in', key })
    }
    for (const key of customKeys) {
      items.set(key.id, { kind: 'custom', key })
    }
    return items
  }, [customKeys])

  return (
    <>
      <Text style={[styles.groupHeading, styles.groupTopGap]}>SHORTCUT BAR</Text>
      <Text style={styles.groupDescription}>
        Choose one to three rows. Hold a grip to reorder or drag a key to another row.
      </Text>
      <View
        style={styles.rowCountGroup}
        accessibilityRole="radiogroup"
        accessibilityLabel="Shortcut bar rows"
      >
        {([1, 2, 3] as const).map((count) => (
          <Pressable
            key={count}
            style={({ pressed }) => [
              styles.rowCountButton,
              shortcutLayout.rows.length === count && styles.rowCountSelected,
              pressed && styles.rowPressed
            ]}
            onPress={() => setRowCount(count)}
            accessibilityRole="radio"
            accessibilityLabel={`${count} ${count === 1 ? 'row' : 'rows'}`}
            accessibilityState={{ checked: shortcutLayout.rows.length === count }}
          >
            <Text
              style={[
                styles.rowCountText,
                shortcutLayout.rows.length === count && styles.rowCountTextSelected
              ]}
            >
              {count}
            </Text>
          </Pressable>
        ))}
      </View>
      {shortcutLayout.rows.map((row, rowIndex) => {
        const items = row.flatMap((id) => {
          const item = itemsById.get(id)
          return item ? [item] : []
        })
        return (
          <View
            key={rowIndex}
            style={[
              styles.section,
              styles.sectionTopGap,
              activeDragRow === rowIndex && styles.dragSection
            ]}
          >
            <Text style={styles.rowHeading}>ROW {rowIndex + 1}</Text>
            <View
              collapsable={false}
              ref={(view) => {
                if (view) {
                  rowTargetsRef.current.set(rowIndex, view)
                } else {
                  rowTargetsRef.current.delete(rowIndex)
                }
              }}
              style={items.length === 0 && styles.emptyDropTarget}
            >
              {items.length === 0 ? <Text style={styles.emptyText}>Drop a key here</Text> : null}
              <DragReorderList
                items={items}
                itemKey={(item) => item.key.id}
                itemAccessibilityLabel={(item) =>
                  item.kind === 'built-in'
                    ? (item.key.accessibilityLabel ?? item.key.label)
                    : item.key.label
                }
                rowHeight={REORDER_ROW_HEIGHT}
                scrollRef={scrollRef}
                scrollOffsetY={scrollOffsetY}
                scrollContentHeight={scrollContentHeight}
                onDragActiveChange={(active) => {
                  setActiveDragRow(active ? rowIndex : null)
                  onDragActiveChange(active)
                }}
                onReorder={(keys) => reorderRow(rowIndex, keys)}
                onDrop={(id, y, keys) => handleDrop(rowIndex, id, y, keys)}
                rowIndex={rowIndex}
                rowCount={shortcutLayout.rows.length}
                onMoveToRow={(id, targetRow) =>
                  moveKey(id, targetRow, shortcutLayout.rows[targetRow]?.length ?? 0)
                }
                renderRow={(item) => (
                  <AccessoryRow
                    item={item}
                    visible={visibleBuiltInSet.has(item.key.id)}
                    onToggle={(visible) => toggleBuiltInKey(item.key.id, visible)}
                    onDelete={() => handleDeleteCustomKey(item.key as CustomKey)}
                  />
                )}
              />
            </View>
          </View>
        )
      })}
      <View style={[styles.section, styles.sectionTopGap]}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={reset}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Reset Defaults</Text>
            <Text style={styles.rowSublabel}>Show every built-in key in one row</Text>
          </View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setShowCustomKeyModal(true)}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Add Custom Shortcut…</Text>
            <Text style={styles.rowSublabel}>Create key combo or text macro</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      <CustomKeyModal
        visible={showCustomKeyModal}
        onClose={() => setShowCustomKeyModal(false)}
        onKeysChanged={(keys) => {
          const next = createTerminalAccessoryLayoutPreference(
            shortcutLayoutRef.current,
            undefined,
            keys.map((key) => key.id)
          )
          setCustomKeys(keys)
          shortcutLayoutRef.current = next
          setShortcutLayout(next)
          persist(next, keys)
        }}
      />
    </>
  )
}
