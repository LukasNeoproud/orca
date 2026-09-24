import type { MobileEmulatorCodecPreference } from './mobile-emulator-codec-preferences'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native'
import {
  ArrowLeft,
  Home,
  Keyboard,
  Maximize,
  Minimize,
  Send,
  SlidersHorizontal
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import {
  MOBILE_EMULATOR_PROFILES,
  type MobileEmulatorDevice,
  type MobileEmulatorProfile
} from './mobile-emulator-types'
import { useMobileEmulatorStream } from './use-mobile-emulator-stream'
import { MobileEmulatorScreen } from './MobileEmulatorScreen'
import { emulatorStyles as styles } from './MobileEmulatorPane.styles'

export function MobileEmulatorPane({
  client,
  device,
  appActive
}: {
  client: RpcClient | null
  device: MobileEmulatorDevice
  appActive: boolean
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [profile, setProfile] = useState<MobileEmulatorProfile>('responsive')
  const [codecPreference, setCodecPreference] = useState<MobileEmulatorCodecPreference>('auto')
  const [codecSettings, setCodecSettings] = useState(false)
  const [settings, setSettings] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [text, setText] = useState('')
  const stream = useMobileEmulatorStream(client, device.id, profile, appActive, codecPreference)
  const toggleFullscreen = () => {
    // Reparenting a native surface needs a new stream keyframe.
    if (stream.videoCodec !== 'jpeg') {
      stream.restartVideo()
    }
    setFullscreen((value) => !value)
  }
  const sendText = () => {
    if (!text || !stream.ready) {
      return
    }
    stream.sendInput({ type: 'type', text })
    setText('')
  }
  const button = (label: string, icon: React.ReactNode, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
    >
      {icon}
    </Pressable>
  )
  const content = (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.toolbar}>
        <Text numberOfLines={1} style={styles.title}>
          {device.name}
        </Text>
        {button(
          'Stream quality settings',
          <SlidersHorizontal size={20} color={colors.textSecondary} />,
          () => setSettings(true)
        )}
        {button(
          fullscreen ? 'Exit fullscreen' : 'Fullscreen',
          fullscreen ? (
            <Minimize size={20} color={colors.textSecondary} />
          ) : (
            <Maximize size={20} color={colors.textSecondary} />
          ),
          toggleFullscreen
        )}
      </View>
      <MobileEmulatorScreen
        frames={stream.frames}
        enabled={stream.ready && appActive}
        sendInput={stream.sendInput}
        onVideoRendered={stream.onVideoRendered}
        onVideoError={stream.onVideoError}
      />
      {stream.error ? (
        <View style={styles.status}>
          <Text style={styles.error}>{stream.error}</Text>
          {button('Reconnect emulator', <Text style={styles.text}>Reconnect</Text>, stream.retry)}
        </View>
      ) : !stream.ready ? (
        <View style={styles.status}>
          {appActive && client ? <ActivityIndicator color={colors.textSecondary} /> : null}
          <Text style={styles.muted}>
            {appActive && client
              ? 'Starting device and connecting to its screen…'
              : 'Stream paused'}
          </Text>
        </View>
      ) : null}
      {keyboard ? (
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Text to type on emulator"
            value={text}
            onChangeText={setText}
            onSubmitEditing={sendText}
            style={styles.input}
            placeholder="Type on device"
            placeholderTextColor={colors.textMuted}
            maxLength={4096}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="send"
          />
          {button(
            'Send text to emulator',
            <Send size={20} color={colors.textSecondary} />,
            sendText,
            !stream.ready || !text
          )}
        </View>
      ) : null}
      <View style={styles.controls}>
        {device.backend === 'android'
          ? button(
              'Back',
              <ArrowLeft size={20} color={colors.textSecondary} />,
              () => stream.sendInput({ type: 'button', name: 'back' }),
              !stream.ready
            )
          : null}
        {button(
          'Home',
          <Home size={20} color={colors.textSecondary} />,
          () => stream.sendInput({ type: 'button', name: 'home' }),
          !stream.ready
        )}
        {button(
          'Type text',
          <Keyboard size={20} color={colors.textSecondary} />,
          () => setKeyboard(!keyboard),
          !stream.ready
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Video format"
        onPress={() => setCodecSettings(true)}
        style={styles.status}
      >
        <Text style={styles.muted}>
          Video: {stream.videoCodec.toUpperCase()} ·{' '}
          {codecPreference === 'auto' ? 'Automatic' : codecPreference.toUpperCase()}
        </Text>
        {stream.codecNotice ? <Text style={styles.muted}>{stream.codecNotice}</Text> : null}
      </Pressable>
      <ActionSheetModal
        visible={codecSettings}
        title="Video format"
        message="Available formats depend on both devices. Unsupported formats fall back automatically."
        actions={(['auto', 'h264', 'hevc', 'av1', 'jpeg'] as const).map((codec) => ({
          label: `${codec === 'auto' ? 'Automatic' : codec === 'hevc' ? 'HEVC / H.265' : codec === 'h264' ? 'H.264' : codec.toUpperCase()}${codecPreference === codec ? ' · Selected' : ''}`,
          onPress: () => setCodecPreference(codec)
        }))}
        onClose={() => setCodecSettings(false)}
      />
      <ActionSheetModal
        visible={settings}
        title="Stream quality"
        message="Choose image detail, update speed or lower data use."
        actions={MOBILE_EMULATOR_PROFILES.map((item) => ({
          label: `${item.label}${item.id === profile ? ' · Selected' : ''}`,
          hint: item.hint,
          onPress: () => setProfile(item.id)
        }))}
        onClose={() => setSettings(false)}
      />
    </KeyboardAvoidingView>
  )
  if (!fullscreen) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.root}>
        {content}
      </SafeAreaView>
    )
  }
  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={toggleFullscreen}
    >
      <SafeAreaView style={styles.root}>{content}</SafeAreaView>
    </Modal>
  )
}
