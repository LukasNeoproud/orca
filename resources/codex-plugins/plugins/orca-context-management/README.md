# Orca Context Management

This is an opt-in Codex plugin for Codex sessions that Orca owns. Orca does not change a repository, `AGENTS.md`, a Codex global configuration file, or an Orca setting to enable it.

## Install

Codex CLI does not provide a command to install a standalone plugin directory. It installs plugins from a configured marketplace. Orca ships this marketplace and never registers it or writes Codex configuration on a user's behalf.

To install it through Codex CLI, deliberately register the supplied local marketplace, then run:

```sh
codex plugin marketplace add /path/to/codex-plugins
codex plugin add orca-context-management@orca-local
```

In a source checkout, the marketplace root is `resources/codex-plugins`. In a packaged Orca app, it is under the app resources directory as `codex-plugins`. Do not copy `.mcp.json` into a project: the plugin supplies its own MCP server configuration.

The MCP server starts `orca agent-context mcp`. It receives only the current Orca session binding and the app's runtime-data path; it cannot select a different conversation, workspace, terminal, or host.

## Enable transitions

Context transitions remain disabled until the Orca setting **Agent context management** is set:

- `off` rejects all transition requests.
- `compact` accepts only compaction requests.
- `all` accepts compaction and fresh-context requests.

The default is `off`. Changing this setting is separate from installing the plugin.

## Use

Use `request_compact` after a substantial completed topic when the next work belongs in the same conversation. Use `request_fresh_context` only for an independent next stage with a complete checkpoint. Each tool returns a queued request ID. After it is accepted, end the current turn; Orca applies it afterward. Check `context_request_status` only before queuing or in a later turn, or use `cancel_context_request` while it is still queued. `context_transition_state` reports current support and state.

A checkpoint includes the goal, completed work, decisions, constraints, changes, verification, open questions, and a concrete next step when continuation is authorized. A request never treats queue acceptance as completion.

`wait-for-user` opens the prepared context without starting a model turn. `continue` submits the authorized next step once. Both preserve the original transcript. Compaction uses model tokens; a fresh context carries the checkpoint and an immutable reference to the original transcript.

Codex terminals (including Chat UI) and native structured sessions are supported. Terminal switching requires the pane to remain mounted in an Orca client. Direct SSH/WSL sessions and Pi are not supported yet; no transition is attempted there. Paired runtime requests execute on the owning host and require the context-management capability on both sides.

Verified against Codex CLI 0.155.1. Older versions must support the required app-server methods; a missing method reports `agent_context_provider_unsupported` without replacing the source conversation.
