import { useState } from 'react'
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import {
  ChevronDown,
  ChevronsRight,
  Keyboard as KeyboardIcon,
  Monitor,
  Plus,
  Smartphone
} from 'lucide-react-native'
import { triggerMediumImpact } from '../platform/haptics'
import { createTerminalLiveAccessoryInput } from '../terminal/terminal-live-accessory-input'
import { getVisibleTerminalAccessoryRows } from '../terminal/terminal-accessory-layout'
import { keepHeldPressThroughLongPress } from './held-press-long-press'
import { isTerminalPhoneDisplayMode } from './mobile-session-route-helpers'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'
import { useKeyboardPersistingTaps } from '../platform/keyboard-persisting-taps'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileTerminalAccessoryRows({
  controller
}: {
  controller: MobileSessionController
}) {
  const {
    activeHandle,
    customKeys,
    accessoryLayout,
    visibleBuiltInAccessoryKeys,
    pendingModifiers,
    togglePendingModifier,
    consumePendingAccessoryKey,
    setShowCustomKeyModal,
    setDeleteKeyTarget,
    terminalModes,
    canPaste,
    canSend,
    canCompose,
    liveInputEnabled,
    toggleDisplayMode,
    handleAccessoryKey,
    dismissSoftwareKeyboard,
    toggleLiveInput,
    stopAccessoryRepeat,
    startAccessoryRepeat,
    handlePaste,
    keyboardLift
  } = controller
  const [rowPage, setRowPage] = useState(0)
  const { height: windowHeight } = useWindowDimensions()
  const accessoryRows = getVisibleTerminalAccessoryRows(
    accessoryLayout,
    customKeys.map((key) => key.id)
  )
  const rowCapacity = Math.max(1, Math.min(3, Math.floor((windowHeight - keyboardLift - 300) / 42)))
  const firstVisibleRow = Math.min(rowPage, Math.max(0, accessoryRows.length - rowCapacity))
  const rowsToShow = accessoryRows.slice(firstVisibleRow, firstVisibleRow + rowCapacity)
  const builtInById = new Map(visibleBuiltInAccessoryKeys.map((key) => [key.id, key]))
  const customById = new Map(customKeys.map((key) => [key.id, key]))
  const prepareBuiltIn = (key: (typeof visibleBuiltInAccessoryKeys)[number]) =>
    pendingModifiers.length > 0
      ? { bytes: consumePendingAccessoryKey(key.id, key.bytes ?? ''), resetMirrorBeforeSend: true }
      : createTerminalLiveAccessoryInput(key)
  const accessoryBarKeepsKeyboard = useKeyboardPersistingTaps('always')
  return (
    <View ref={accessoryBarKeepsKeyboard} style={styles.accessoryBar}>
      {/* Why: fixed keyboard escape hatch; outside ScrollView + shortcut path so it can't scroll away or be hidden (#5106). */}
      {keyboardLift > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.keyboardDismissKey,
            pressed && styles.accessoryKeyPressed
          ]}
          onPress={dismissSoftwareKeyboard}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
          accessibilityHint="Hides the software keyboard and keeps the current terminal session open."
        >
          <View style={styles.keyboardDismissGlyph}>
            <KeyboardIcon size={15} color={colors.textSecondary} strokeWidth={2} />
            <ChevronDown
              size={10}
              color={colors.textSecondary}
              strokeWidth={2.5}
              style={styles.keyboardDismissChevron}
            />
          </View>
        </Pressable>
      )}
      {/* Why: default tap handling makes the first accessory-key tap dismiss the keyboard and get swallowed (#5106). */}
      <View style={styles.accessoryRows}>
        {rowsToShow.map((row, visibleRowIndex) => (
          <ScrollView
            key={firstVisibleRow + visibleRowIndex}
            style={styles.accessoryScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.accessoryContent}
            keyboardShouldPersistTaps="always"
          >
            {firstVisibleRow + visibleRowIndex === 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.accessoryKey,
                  pressed && styles.accessoryKeyPressed,
                  !canSend && styles.accessoryKeyDisabled
                ]}
                disabled={!canSend}
                onPress={() => {
                  if (activeHandle) {
                    void toggleDisplayMode(activeHandle)
                  }
                }}
                accessibilityLabel={
                  isTerminalPhoneDisplayMode(activeHandle, terminalModes)
                    ? 'Switch to desktop mode'
                    : 'Switch to phone mode'
                }
              >
                {isTerminalPhoneDisplayMode(activeHandle, terminalModes) ? (
                  <Monitor size={14} color={canSend ? colors.textSecondary : colors.textMuted} />
                ) : (
                  <Smartphone size={14} color={canSend ? colors.textSecondary : colors.textMuted} />
                )}
              </Pressable>
            )}
            {firstVisibleRow + visibleRowIndex === 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.accessoryKey,
                  liveInputEnabled && styles.accessoryKeyActive,
                  pressed && styles.accessoryKeyPressed,
                  !canCompose && styles.accessoryKeyDisabled
                ]}
                // Why: offline, live mode is dead but the buffered box still composes — keep the escape hatch tappable (#6713).
                disabled={!canCompose}
                onPress={toggleLiveInput}
                accessibilityLabel={
                  liveInputEnabled
                    ? 'Switch to buffered command input'
                    : 'Switch to live terminal input'
                }
              >
                <ChevronsRight
                  size={14}
                  color={
                    liveInputEnabled
                      ? colors.bgBase
                      : canCompose
                        ? colors.textSecondary
                        : colors.textMuted
                  }
                />
              </Pressable>
            )}
            {firstVisibleRow + visibleRowIndex === 0 && canPaste && (
              <Pressable
                style={({ pressed }) => [
                  styles.accessoryKey,
                  pressed && styles.accessoryKeyPressed,
                  !canSend && styles.accessoryKeyDisabled
                ]}
                disabled={!canSend}
                onPress={() => void handlePaste()}
                accessibilityLabel="Paste from clipboard"
              >
                <Text
                  style={[styles.accessoryKeyText, !canSend && styles.accessoryKeyTextDisabled]}
                >
                  Paste
                </Text>
              </Pressable>
            )}
            {row.map((id) => {
              const key = builtInById.get(id)
              if (!key) {
                const customKey = customById.get(id)
                if (!customKey) {
                  return null
                }
                return (
                  <Pressable
                    key={customKey.id}
                    style={({ pressed }) => [
                      styles.accessoryKey,
                      styles.customAccessoryKey,
                      pressed && styles.accessoryKeyPressed,
                      !canSend && styles.accessoryKeyDisabled
                    ]}
                    disabled={!canSend}
                    onPress={() =>
                      void handleAccessoryKey({
                        bytes: consumePendingAccessoryKey(customKey.id, customKey.bytes)
                      })
                    }
                    onLongPress={() => {
                      triggerMediumImpact()
                      setDeleteKeyTarget(customKey)
                    }}
                    delayLongPress={400}
                    accessibilityLabel={`Send ${customKey.label}`}
                  >
                    <Text
                      style={[styles.accessoryKeyText, !canSend && styles.accessoryKeyTextDisabled]}
                    >
                      {customKey.label}
                    </Text>
                  </Pressable>
                )
              }
              const isModifier = key.modifier !== undefined
              const modifierActive = isModifier && pendingModifiers.includes(key.modifier!)
              const enabled = canSend && (!isModifier || liveInputEnabled)
              return (
                <Pressable
                  key={key.id}
                  style={({ pressed }) => [
                    styles.accessoryKey,
                    modifierActive && styles.accessoryKeyActive,
                    pressed && styles.accessoryKeyPressed,
                    !enabled && styles.accessoryKeyDisabled
                  ]}
                  disabled={!enabled}
                  onPressIn={() => {
                    if (!key.repeatable || isModifier) {
                      return
                    }
                    const input = prepareBuiltIn(key)
                    void handleAccessoryKey(input)
                    startAccessoryRepeat(input)
                  }}
                  onPressOut={() => {
                    if (key.repeatable) {
                      stopAccessoryRepeat()
                    }
                  }}
                  onPress={() => {
                    if (key.repeatable) {
                      return
                    }
                    if (key.modifier) {
                      togglePendingModifier(key.modifier)
                      return
                    }
                    void handleAccessoryKey(prepareBuiltIn(key))
                  }}
                  onLongPress={key.repeatable ? keepHeldPressThroughLongPress : undefined}
                  accessibilityRole={isModifier ? 'togglebutton' : 'button'}
                  accessibilityState={
                    isModifier
                      ? { selected: modifierActive, disabled: !enabled }
                      : { disabled: !enabled }
                  }
                  accessibilityLabel={
                    isModifier && !liveInputEnabled
                      ? `${key.label} modifier unavailable in buffered command input`
                      : (key.accessibilityLabel ?? `Send ${key.label}`)
                  }
                >
                  <Text
                    style={[
                      styles.accessoryKeyText,
                      modifierActive && styles.accessoryKeyTextActive,
                      !enabled && styles.accessoryKeyTextDisabled
                    ]}
                  >
                    {key.label}
                  </Text>
                </Pressable>
              )
            })}
            {firstVisibleRow + visibleRowIndex === 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.accessoryKey,
                  pressed && styles.accessoryKeyPressed
                ]}
                onPress={() => setShowCustomKeyModal(true)}
                accessibilityLabel="Add custom shortcut"
              >
                <Plus size={14} color={colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            )}
          </ScrollView>
        ))}
      </View>
      {accessoryRows.length > rowCapacity && (
        <Pressable
          onPress={() =>
            setRowPage(
              firstVisibleRow + rowCapacity >= accessoryRows.length ? 0 : firstVisibleRow + 1
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Show more shortcut rows"
          style={styles.accessoryKey}
        >
          <Text style={styles.accessoryKeyText}>
            Rows {firstVisibleRow + 1}–
            {Math.min(accessoryRows.length, firstVisibleRow + rowCapacity)}/{accessoryRows.length}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
