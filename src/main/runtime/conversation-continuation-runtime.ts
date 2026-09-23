import { CodexContinuationService } from '../codex/codex-continuation-service'
import { ConversationContinuationScheduler } from './conversation-continuation-scheduler'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import type { OrcaRuntimeService } from './orca-runtime'
import { createAgentContextRuntime } from './agent-context-runtime'

const services = new WeakMap<
  OrcaRuntimeService,
  { service: CodexContinuationService; scheduler: ConversationContinuationScheduler } & ReturnType<
    typeof createAgentContextRuntime
  >
>()

export function conversationContinuationRuntime(runtime: OrcaRuntimeService) {
  let entry = services.get(runtime)
  if (!entry) {
    const directory = getProfileUserDataPath()
    const service = new CodexContinuationService({
      userDataPath: directory,
      resolveSource: (source) => runtime.resolveConversationContinuationSource(source)
    })
    const context = createAgentContextRuntime(runtime, service)
    const scheduler = new ConversationContinuationScheduler({
      directory,
      service,
      settings: () => runtime.getConversationContinuationSettings(),
      busy: (id) => runtime.isConversationContinuationBusy(id),
      agentContextTick: () => context.transitions.tick()
    })
    entry = { service, scheduler, ...context }
    services.set(runtime, entry)
  }
  return entry
}

export function startConversationContinuation(runtime: OrcaRuntimeService): void {
  void Promise.resolve()
    .then(() => conversationContinuationRuntime(runtime).scheduler.tick())
    .catch((error) => {
      console.warn('[conversation-continuation] Could not restore schedule', error)
    })
}
