# Branching Claude conversations

Read this before changing how Orca forks a Claude conversation, opens a branch, or hands a branch's
result back. Branching works for Claude in a chat, Claude in a terminal and Claude chats on Android.

## The rule: a branch never starts work

Creating a branch, alone or one per review finding, never sends anything. The branch opens with its
prompt unsent: in the chat composer, or in Claude's input line through `--prefill` in a terminal.
Branches share the workspace (there is no worktree per branch), so starting two at once would mix
their file changes. The person sends each branch when its turn comes. The only work that runs at
once is the summary of a summarized branch (`/compact`), which does not touch files.

The same holds for the way back: a result handed back lands as a draft in the parent's composer or
input line, never as a message.

## Where the links live

The host keeps one record per branch in `conversation-branches.json` in its state directory
(`src/main/runtime/conversation-branch-store.ts`). Records are keyed by the Claude session id of
the child. That id is the same in a chat and a terminal and survives moving a conversation between
them, so a family keeps working when a member changes surface. The record schema, the family tree
and the finding extraction are pure and shared with the phone: `src/shared/conversation-branch*.ts`.

A retried `requestId` returns the existing record. A fork whose outcome is unknown is recorded as
`fork-unverified` and is never retried automatically.

## Forking (host)

`src/main/runtime/conversation-branch-service.ts` decides the branch point, then:

- **Whole conversation:** the Agent SDK's `forkSession(parent, { upToMessageId })`. The SDK reads
  `CLAUDE_CONFIG_DIR` from its process once, so the fork runs in a worker process pinned to the
  parent's Claude account (`claude-conversation-fork-worker*.ts`).
- **Summarized:** a Claude connection with `resume`, `forkSession`, `resumeSessionAt` and a chosen
  session id, which then runs `/compact <focus>` (`claude-conversation-compact-fork.ts`).
- **New conversation:** nothing is forked; the record only links a fresh conversation to its parent.

The host always resolves the boundary itself, to the last main-chain entry of the chosen turn
(`claude-transcript-turns.ts`). A chat names a journal item, which the host maps to its turn; a
terminal names the prompt uuid that `conversationBranch.outline` listed. Streamed message ids are
never trusted as transcript uuids. Rows without a parent (a fork's `custom-title`) are not part of
the chain.

## RPC

Methods are `conversationBranch.list`, `outline`, `prepare` and `recordReturn`, behind the
`conversation-branch.v1` capability (`CONVERSATION_BRANCH_RUNTIME_CAPABILITY`). Clients never call
them on a host that does not advertise it. `list` also returns each Claude chat's conversation id,
because the phone cannot read it. The methods are allowlisted for mobile.

## Clients

- **Chat (desktop):** "Branch from here" and "Branch per finding" on a finished reply. A
  breadcrumb in a branch shows the way back. A chip at a branch point shows the family. A guard asks
  before a send while another family member is working. Code is in `native-chat/NativeChatBranch*`,
  `conversation-branch/` and `lib/conversation-branch-*.ts`.
- **Terminal (desktop):** the branch menu in a Claude pane's header (`TerminalPaneBranchMenu.tsx`).
  It offers branching after a chosen turn into a new terminal or chat, the family, and returning a
  result. A terminal branch runs `claude --resume <fork>`, or `--session-id <id>` for a new
  conversation, with `--prefill`. A terminal member of a family is focused when its pane runs it,
  otherwise it resumes in a new terminal.
- **Android:** the long-press sheet of a finished reply offers branching, returning a result and the
  family (`mobile/src/session/*ConversationBranch*`). The phone has no per-finding branching, and it
  does not open terminal branches.

A branch's prompt is written into the composer draft of the new chat's tab, not into a launch
draft: a launch draft is dropped once the transcript shows a user turn, and a resumed branch always
has one.

## Known limits

- The send guard watches chats only; Orca cannot hold back an Enter typed in a terminal.
- A queued "send when it finishes" lives in the renderer and does not survive a restart.
- The phone opens a branch point without scrolling to it.
- Dirty-tree warnings for git worktrees are not implemented.
