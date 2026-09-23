import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { PortableConversationSourceAnchor } from '../../../src/shared/portable-conversation-source'
import type { RpcClient } from '../transport/rpc-client'
import { colors } from '../theme/mobile-theme'
import { BottomDrawer } from '../components/BottomDrawer'
import { nativeChatMessageText } from '../session/mobile-native-chat-message-text'
import {
  appendMobilePortableSourcePage,
  EMPTY_MOBILE_PORTABLE_SOURCE_STATE,
  mobilePortableSourceKey,
  mobilePortableSourceAnchor,
  type MobilePortableConversationRoute,
  type MobilePortableSourceState
} from './mobile-portable-conversation'
import { readMobilePortableSourcePage } from './mobile-portable-conversation-rpc'
import { portableStyles as styles } from './mobile-portable-conversation-styles'

type Props = {
  visible: boolean
  client: RpcClient | null
  route: MobilePortableConversationRoute
  onClose: () => void
  onSelect: (anchor: PortableConversationSourceAnchor) => void
}

export function MobilePortableConversationSourceDrawer(props: Props): React.JSX.Element {
  const [state, setState] = useState<MobilePortableSourceState>(EMPTY_MOBILE_PORTABLE_SOURCE_STATE)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const generationRef = useRef(0)
  const sourceKey = mobilePortableSourceKey(props.route.source)

  useEffect(() => {
    generationRef.current += 1
    setState(EMPTY_MOBILE_PORTABLE_SOURCE_STATE)
    setMessage(null)
    if (props.visible) {
      void loadPage(undefined, true)
    }
  }, [sourceKey, props.client, props.visible])

  const loadPage = async (
    cursor: MobilePortableSourceState['nextCursor'] | undefined,
    replace = false
  ): Promise<void> => {
    if (!props.client || (loading && !replace)) {
      return
    }
    const generation = ++generationRef.current
    setLoading(true)
    setMessage(null)
    try {
      const page = await readMobilePortableSourcePage(
        props.client,
        props.route.source,
        cursor ?? undefined
      )
      if (generation !== generationRef.current) {
        return
      }
      setState((current) => {
        const base = replace ? EMPTY_MOBILE_PORTABLE_SOURCE_STATE : current
        if (base.identity && base.identity.fingerprint !== page.identity.fingerprint) {
          setMessage('The source transcript changed. Earlier cached evidence was removed.')
        }
        return appendMobilePortableSourcePage(base, page)
      })
      if (!page.turnEvidence) {
        setMessage('This host cannot prove completed responses. Update Orca on the host.')
      } else if (page.warnings.length > 0) {
        setMessage(page.warnings.join(' '))
      }
    } catch (error) {
      if (generation === generationRef.current) {
        setMessage(error instanceof Error ? error.message : 'Unable to read the SSH transcript.')
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <BottomDrawer visible={props.visible} onClose={props.onClose} fillAvailable>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>SSH conversation source</Text>
          <Text style={styles.description}>
            Read-only host evidence. Only provider-completed responses can be selected.
          </Text>
        </View>
        <View style={styles.evidence}>
          <Text style={styles.evidenceText}>Execution host</Text>
          <Text style={styles.mono} numberOfLines={1}>
            {props.route.source.executionHostId.slice(4)}
          </Text>
          <Text style={styles.evidenceText}>Workspace</Text>
          <Text style={styles.mono} numberOfLines={2}>
            {props.route.source.workspace.path}
          </Text>
        </View>
        {message ? (
          <View style={styles.status} accessibilityRole="alert">
            <Text style={styles.statusText}>{message}</Text>
          </View>
        ) : null}
        {state.messages.map((item) => {
          const anchor = mobilePortableSourceAnchor(state, item.id)
          return (
            <View key={item.id} style={styles.message}>
              <Text style={styles.messageRole}>{item.role}</Text>
              <Text style={styles.messageText}>{nativeChatMessageText(item.blocks)}</Text>
              {item.role === 'assistant' && anchor ? (
                <View style={styles.actions}>
                  <Pressable
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Prepare a portable branch from this response"
                    onPress={() => props.onSelect(anchor)}
                  >
                    <Text style={styles.buttonText}>Branch from response</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        })}
        {loading ? <ActivityIndicator style={styles.loading} color={colors.textSecondary} /> : null}
        <View style={styles.actions}>
          {state.nextCursor ? (
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              disabled={loading}
              onPress={() => void loadPage(state.nextCursor)}
            >
              <Text style={styles.buttonText}>Load more</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={props.onClose}
          >
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </BottomDrawer>
  )
}
