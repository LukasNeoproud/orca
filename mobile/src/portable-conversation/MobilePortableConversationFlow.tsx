import { useState } from 'react'
import type { PortableConversationSourceAnchor } from '../../../src/shared/portable-conversation-source'
import type { RpcClient } from '../transport/rpc-client'
import {
  mobilePortableSourceKey,
  type MobilePortableConversationRoute
} from './mobile-portable-conversation'
import { MobilePortableConversationSourceDrawer } from './MobilePortableConversationSourceDrawer'
import { MobilePortableConversationBranchDrawer } from './MobilePortableConversationBranchDrawer'

type Props = {
  client: RpcClient | null
  route: MobilePortableConversationRoute | null
  onClose: () => void
  onOpenTarget: (worktreeId: string, message: string) => void
}

export function MobilePortableConversationFlow(props: Props): React.JSX.Element | null {
  if (!props.route) {
    return null
  }
  return (
    <MobilePortableConversationFlowContent
      key={mobilePortableSourceKey(props.route.source)}
      {...props}
      route={props.route}
    />
  )
}

function MobilePortableConversationFlowContent(
  props: Props & { route: MobilePortableConversationRoute }
): React.JSX.Element {
  const [anchor, setAnchor] = useState<PortableConversationSourceAnchor | null>(null)
  const close = (): void => {
    setAnchor(null)
    props.onClose()
  }

  return (
    <>
      <MobilePortableConversationSourceDrawer
        visible={!anchor}
        client={props.client}
        route={props.route}
        onClose={close}
        onSelect={setAnchor}
      />
      {anchor ? (
        <MobilePortableConversationBranchDrawer
          visible
          client={props.client}
          route={props.route}
          anchor={anchor}
          onClose={close}
          onOpenTarget={(worktreeId, message) => {
            setAnchor(null)
            props.onOpenTarget(worktreeId, message)
          }}
        />
      ) : null}
    </>
  )
}
