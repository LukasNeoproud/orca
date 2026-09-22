import {
  usePortableConversationRequest,
  closePortableConversation
} from '@/lib/portable-conversation-request'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { RecoverableRenderErrorBoundary } from '@/components/error-boundaries/RecoverableRenderErrorBoundary'

const Flow = lazyWithRetry(() =>
  import('@/components/native-chat/PortableConversationFlow').then((module) => ({
    default: module.PortableConversationFlow
  }))
)
export function PortableConversationSurface(): React.JSX.Element | null {
  const request = usePortableConversationRequest()
  return request ? (
    <RecoverableRenderErrorBoundary
      boundaryId="modal.portable-conversation"
      surface="modal"
      compact
      resetKey={request.requestId}
    >
      <Flow key={request.requestId} request={request} onClose={closePortableConversation} />
    </RecoverableRenderErrorBoundary>
  ) : null
}
