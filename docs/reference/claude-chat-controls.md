# What a Claude chat answers itself

Read this before changing how a structured Claude chat handles `/mcp`, `/permissions`, `/btw`,
permission prompts or MCP elicitation. These are the parts of Claude's terminal UI that have no
stream-json output, so the chat draws them itself.

## One request channel to the running CLI

`agentSession.claudeControl` carries every out-of-turn request, behind the
`agent-session.claude-control.v1` capability. The request union and reply shapes are in
`src/shared/claude-session-control.ts`; the host side is `src/main/claude/claude-session-controls.ts`.

- A request needs the chat's running CLI. A chat at rest has none, so the host throws
  `claude_session_not_running` and the panel says to send a message first.
- MCP status, reconnect, enable/disable, sign-in and sign-out, the permission rule list, the side
  question and "move to background" are the CLI's own control requests, sent by wire body. The
  typings of the installed SDK redact several of them; the wire names are what the CLI answers.
- The method is not on the mobile allowlist. Adding it there needs a look at permission rule
  editing first: a paired phone could then write allow rules.

## Permission rules are Claude's settings files

The CLI can list rules but not change them, so adding or removing one edits the settings file the
rule lives in (`claude-permission-rule-settings-file.ts`): the account's `settings.json`, or the
workspace's `.claude/settings.json` and `.claude/settings.local.json`. The running CLI watches those
files, so the change applies without a restart. A file that is not a JSON object is never rewritten.
Session and managed rules are listed read-only.

## Permission prompts

An approval item says what its answer may carry in `accepts` (`note`, `inputField`). A client sends
`note` and `inputValue` only for an item that has it, which is also how an older host is spared the
unknown keys.

- A declining answer's note reaches Claude in the denial message.
- Only a Bash `command` can be rewritten; the host replaces that one field and nothing else.
- "Always allow" is offered only when the CLI proposed something to remember, labelled with it.
- A plan is approved into accepting edits or into asking, or sent back with a note.

## MCP elicitation

A server's request for input is registered as a pending `AskUserQuestion` prompt
(`claude-mcp-elicitation-prompt.ts`), so it uses the question card, its answering and its
cancellation unchanged. Each form field is one question; a sign-in link is one question with the
link in it. A dismissed card declines, an aborted request cancels.

## Other pieces

- `/compact <focus>` rides the existing compact command as `instructions`
  (`agent-session.compact-instructions.v1`); the user's row shows the text they typed.
- Images a tool returns are written under `agent-session-tool-images/` in the host's state
  directory and journaled as a row of their own after the tool row.
- An automatic compaction writes a "Context compacted" row; a `/compact` reports through its turn.
- The CLI sends no command output while a command runs, only elapsed time. A running Bash row
  therefore shows how long it has run and offers to move it to the background.

- The permission mode has its own pill beside the model and effort, and Shift+Tab in the message
  box steps through the same list. A chat at rest lists the modes too
  (`restingOptions.permissions`); the pick is saved and applied when its CLI starts.
- `@` offers files and folders (`path/`) only, as the terminal does. The `agents` control request
  lists the session's subagents for a picker that is not built yet.
## The panel beside the chat

`NativeChatSidePanelProvider.tsx` mounts a column beside every structured chat, opened from the
chat's corner button. Its tabs are Background, Plan, Subagents, Context and Artifacts; changes and
branches are Orca's own surfaces and stay out of it.

The panel fetches nothing about the conversation itself. Each piece of the chat that already holds
the data publishes it (`native-chat-side-panel-context.ts`): the transcript its rows and each
subagent's rows, the status strip its background tasks, the composer its context usage and command
list. The plan, task list, subagent list and artifacts are read out of the conversation's rows by
pure functions in `native-chat-side-panel-findings.ts`. Publishes land in a ref while the panel is
closed, so a streaming reply does not re-render it.

A subagent's row in the transcript opens the Subagents tab on that subagent; its rows stay in the
transcript too. A working subagent is stopped by the task id its roster entry carries, through
the same Stop the status strip uses.

The Context tab's cost and plan limits come from the CLI's experimental `get_usage` request
(`claude-session-usage-reply.ts` reads it field by field), asked again whenever the context usage
moves.

Claude's task list arrives one call at a time (`TaskCreate`, `TaskUpdate`), and only because the
launch sets `CLAUDE_CODE_ENABLE_TODO_TOOLS`: a stream-json session otherwise gets no task tools.
`native-chat-claude-task-tool-calls.ts` redraws each call as the whole list after it, which is the
shape the task card and the Plan tab already read. Artifacts are the visuals the agent drew and the claude.ai artifact links in its
text and tool results.

## Not done

- `!` shell mode and the `#` memory shortcut: left out on purpose.
- `@` for MCP resources: the CLI has no request that lists them.
- Rows for scheduled wakeups.
