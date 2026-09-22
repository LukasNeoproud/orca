# Conversation branching

This page records the boundaries for related conversations. It does not turn a
source transcript into permission to resume, mutate, or otherwise take over its
provider session.

## SSH portable source inspection

Direct SSH conversations are inspected by the **controlling runtime** that owns
the registered SSH connection. The renderer asks that runtime for a page; it
does not read a same-looking local path and it does not reinterpret an SSH host
as local when the connection is unavailable.

The runtime first resolves the requested workspace through its host-qualified
workspace lookup. It then proves the selected source against the SSH Agent
Session History scan: execution host, workspace scope, agent, provider session
id, transcript path, and a workspace-contained transcript cwd must all match.
Only then does it use the registered SSH filesystem provider to read the
hook-attested transcript path.

Pages are chronological. A page starts at an opaque byte offset and carries the
remote file fingerprint plus a boundary checkpoint for the bytes immediately
before that offset. A selected message stores the page cursor and the host's
file identity (fingerprint, size, mtime). Re-reading the page checks that proof,
so a rewrite, replacement, truncation, absent host, or missing scanner evidence
does not select a similarly named local transcript. An append may preserve the
earlier checkpoint; it does not make later records part of the selection.

The source inspector deliberately keeps its forward paging separate from native
chat's `hasOlder` path. It exposes an explicit **Load next messages** action and
deduplicates message ids across page boundaries. The inspector is read-only;
selecting an assistant response only returns its source anchor and an optional
same-row selected passage.
Branch controls are available only for assistant responses with provider completion
evidence. A stable file or a disconnected host does not prove that a turn ended.
Completion markers crossing page boundaries are carried in the verified cursor;
context preparation rechecks that evidence before accepting a source anchor.

Portable context has two modes:

- **History** reads from offset zero in order and stops at the exact selected
  message id. It never includes a later source record. The read and rendered
  context are bounded. If earlier records must be omitted,
  `historyTruncated` is true and that value must prevent a preserved-history
  branch; callers may offer targeted context instead.
- **Targeted** rereads only the selected page under its exact cursor and file
  proof. The selected passage must be an exact substring of that assistant
  response. This avoids a full-history size requirement while keeping the
  selected evidence verifiable.

Tool inputs and results are source data, not instructions. Portable Markdown
labels them as untrusted and represents image references without transferring
their contents. The reader includes the recorded source roles and blocks rather
than silently treating an omitted block as a decision.

## Native-provider branching

Completed structured Claude and Codex answers expose **Create related
conversation**. Preparation resolves both workspaces on the owning runtime,
checks the source epoch and selected journal item, and persists the relationship
before any first user turn. Folder workspaces use their workspace identity;
Git worktrees may use the existing workspace composer. Conversation branching
never checks out or resets files.

For a native history fork, Codex uses the installed app-server `thread/fork`
boundary and defers goal continuation. Claude uses the installed SDK's
`resumeSessionAt`/`forkSession` clone-only operation. A source boundary that the
provider cannot represent exactly offers targeted context instead. An
intermediate assistant item with later output in the same provider turn is not
advertised as an exact native fork.

The reviewed instruction or targeted handoff is immutable once prepared.
**Start work** sends that saved content through ordinary structured-session
submission. It does not synthesize a second queue or alter permission settings.
A provider fork whose outcome is unknown is never repeated automatically; a
known provider fork is reused if attaching its Orca tab needs recovery.

## Preparing and starting portable SSH conversations

SSH Claude/Codex history rows with a known source workspace expose **Branch from
response…**. The source inspector offers the same relationship kinds and
workspace choices as the structured flow. History mode is explicitly a portable
copy, not a native provider fork. The exact editable Markdown is saved in the
controlling runtime's existing branch store, together with the source proof,
target workspace, and synthetic conversation identity. Targeted mode reuses the
structured handoff template: purpose, constraints, accepted decisions, unverified
source proposals, references, open questions, and expected verification. The
preview remains editable. The dialog explicitly distinguishes historical
conversation evidence from the target workspace’s current files.

Preparation does not launch an agent. Starting first claims a durable attempt,
then launches through the existing background terminal workflow. The terminal
receipt is persisted before the normal prompt write. A terminal write is
`unknown` delivery, not an agent queue acknowledgement. Reopening the branch
never automatically repeats its prompt. Provider metadata arriving later enriches
the same attempt and reconnects a later history view to its original family.
If the launch receipt has a provider ID but no transcript path, opening or reading
the child resolves that path through the owning runtime's verified history scan.
Only one matching non-subagent transcript may enrich the original attempt.
Ambiguous matches and disconnected hosts remain unavailable without launching or
resending anything. Opening a child from history also reconciles these aliases
before retrieving its conversation family.

A paired runtime's nested SSH connection is resolved only by that runtime. The
desktop does not substitute its own connection with an identical name. Navigation
can activate an exact mirrored terminal receipt; when ownership cannot be proved,
Orca reports that the conversation cannot be opened safely rather than spawning a
second writer.

## Family navigation and returning results

Related conversations persist parent, sibling, descendant, relationship kind,
and exact source anchors. The graph describes conversation origins, not Git
ancestry or automatic task dependencies. Source jumps preserve the selected
historical point; ordinary conversation switching preserves cached view state.
The saved handoff remains visible separately from the navigational parent link.

A return result is a separate immutable artifact with editable conclusion,
decisions, artifacts, verification, and open points before preparation. Both
ends can inspect its exact saved text and delivery state after restart. Sending
uses the parent's ordinary input mechanism. It never merges code, expands
permissions, or marks a task complete. Structured delivery reuses its normal
idempotent operation ID. Portable terminal delivery claims its artifact ID before
writing, remains unverified after a write, and does not replay unknown input.
A confirmed refusal before paste permits retry of the same saved result; partial
paste or an ambiguous transport outcome never authorizes replay.

## Runtime compatibility

The native related-conversation and topic APIs are capability negotiated. Portable
SSH source, branch, result, topic, and proposal methods use
`conversation.portable-ssh.v1`. An older runtime keeps its existing history and
Backlog readers; the new controls report the need to update instead of attempting
an unsupported RPC or falling back to another runtime.

## Topic navigation and proposed subtasks

Structured topic indexes use the durable journal. Portable SSH indexes use the
verified transcript cursor and a separate runtime-owned topic store. Both reuse
the bounded adjacent-turn grouping algorithm and the same rename, merge, split,
and automatic-update controls. Portable scans process a bounded page per explicit
continuation; **Load more** continues an incomplete index. At the tail only the
verified tail page is reread for appended turns. While the inspector is visible,
automatic indexing checks one bounded page every 15 seconds and when new
verified source evidence arrives. The existing visibility-aware poller pauses
in the background; turning automatic indexing off prevents these scans.
Manual boundaries are durable,
and authoritative sequence positions allow splits across page boundaries.

Task proposals analyze one verified prompt or review passage using the existing
bounded deterministic analyzer. No conversation is implicitly sent to another
provider. Automatic suggestions can be disabled without affecting ordinary
prompt submission. The editor previews the complete assembled handoff and lets
the user edit outcome, scope, verification, dependencies, workspace, and context,
merge or reject items, or link an existing related conversation.

Confirmation persists immutable item intents before preparing the selected
branches. It does not launch them. Retries reconcile the saved proposal and reuse
successful item outcomes. Each newly prepared scope can produce an immutable
parent notice; an unknown terminal notice is not automatically resent. Linking
an existing conversation records an association and saved context, not a claim
that its agent received that context or started new work.
