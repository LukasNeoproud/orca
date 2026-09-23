---
name: orca-context-management
description: Request an Orca-managed compaction or linked fresh context for the current Codex session. Use when a completed topic no longer needs its detailed history, or when the next independent stage has a durable checkpoint.
---

# Orca Context Management

Use these tools only inside an Orca-owned Codex session. They identify the current session from the launch environment; do not try to supply a thread, workspace, terminal, or host identifier.

Before requesting a transition, preserve a short checkpoint with the goal, completed work, decisions and constraints, changed files, verification, open questions, and the next concrete step.

Use `request_compact` after a substantial completed topic when the next work still belongs in the same conversation. Use `request_fresh_context` only when moving to an independent stage with a sufficient checkpoint. Do not request a transition after every completion. Keep the current context during active diagnosis, a connected implementation change, or while pending tools and subagents still matter.

Both request tools only queue work. After a request is accepted, end the current turn. Do not wait or poll within that turn; Orca applies it afterward and resumes only the authorized next step. Use `context_request_status` or `context_transition_state` before queuing, or in a later turn. Use `cancel_context_request` if a queued transition is no longer appropriate.

Choose `continuation: "continue"` only when the next step is already authorized. Choose `"wait-for-user"` when no next step is known. Avoid repeated transitions or reset loops. Do not edit project `AGENTS.md`, user configuration, or provider files to install or enable this capability.
