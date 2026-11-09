// Conversation branches live with the transcripts they fork, so a phone reaches the execution host.
export const MOBILE_RPC_CONVERSATION_BRANCH_METHODS = [
  'conversationBranch.list',
  'conversationBranch.outline',
  'conversationBranch.prepare',
  'conversationBranch.recordReturn'
] as const
