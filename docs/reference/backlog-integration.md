# Backlog.md integration

Orca uses the installed `backlog` executable on the workspace's execution host.
The package is named **backlog.md** (`npm install -g backlog.md`), not `backlog`.
There is no automatic installation, project initialization, or agent configuration.

Open **Backlog.md** from the tab bar's **+** menu, or use **Backlog** in the right
sidebar. The sidebar reads tasks, searches their IDs and titles, filters by status,
and previews descriptions and acceptance criteria. Create and edit tasks in the
full web board. Both entry points open the same board tab for that workspace.

The sidebar defaults to **Backlog order** (ascending task `ordinal`). Tasks without
an ordinal follow ordered tasks; ties and missing ordinals use natural task ID order
(`TASK-2` before `TASK-10`). **Sort by** also offers task ID and priority. Priority
uses the project's configured priority order; unknown labels follow alphabetically,
and tasks without a priority come last. Older hosts or failed config reads fall
back to High, Medium, Low, followed by other labels and unprioritized tasks.
Search, status filters, live updates, and returning from task details preserve the
selected sort mode while the workspace panel is mounted. Sorting never edits tasks.

Descriptions and acceptance criteria render Markdown using Orca's existing comment
renderer, including lists, links, emphasis and code blocks. Criteria remain read-only.

## Starting and continuing tasks

Task details offer **Start task** for every task status. Choose a workspace in the
same project and on the same execution host, then select a new or existing
conversation. New conversations use the host's available agents and Orca's normal
agent launch preference. **New chat** explicitly starts a structured chat where the
existing chat capability supports it. Existing conversations retain their agent. Git projects
also offer **New worktree**, using the existing workspace composer and setup flow;
folder projects work without Git.

Immediately before sending, Orca reads the task again from the source workspace.
The prompt includes its ID, title, Markdown description, and checked/unchecked
acceptance criteria. Existing conversations receive it through their normal send
path. A running CLI's own handling of new input still applies; there is no new Orca
queue and no guarantee that input waits for the current work to finish.

A task has one current association, scoped by project identity and execution host.
Independent folder projects use their workspace identity. The owning runtime stores
the source and target workspace, conversation identity, and delivery attempt. Direct
SSH associations live in the controlling runtime; paired environments store them in
their own runtime. Replacing an association never deletes the old conversation.

**Continue** opens or safely restores the associated conversation without sending
the task again. Missing workspaces or conversations allow a new selection.
Unverifiable SSH ownership does not start another agent. A structured send is marked
confirmed only after acknowledgement; terminal input remains **unverified**, since
writing to a terminal does not prove acceptance by the agent. An interrupted or
ambiguous attempt is never automatically resent. Check the linked conversation
before explicitly starting another attempt.

For an SSH connection owned by a paired runtime, the existing history API cannot
address that nested host. Starting a new terminal conversation is supported;
history selection and history-based Continue remain unavailable rather than
reading a same-named connection on the desktop.

Starting tasks requires runtime capability `backlog.task-associations.v1`. Older
runtimes still support the existing Backlog reader and board, and show an update
requirement for the new action. Task status synchronization, multiple association
history, and a general message queue are outside this integration.

## Sidebar navigation

The sidebar keeps search visible and places status and ordering together. Task
titles span up to two lines; a conversation icon indicates a saved link, not a
running agent. The detail shows acceptance-criteria progress and keeps Start or
Continue in its footer. Linked workspace, agent, and conversation metadata stay
visible there; unavailable links offer a new selection. Returning with Back or
Escape restores the task-list position and focus. Arrow keys navigate tasks and
Enter opens the focused task; an empty filtered list offers Clear filters.

## Workspace ownership

Each worktree uses its own checkout. Plain folder workspaces are supported too;
initialize a non-Git project with `backlog init --no-git`. Backlog.md resolves its
own configuration, including `.backlog` and custom project-relative directories.
Orca pins `BACKLOG_CWD` to the execution host's workspace path.

Services are shared by canonical directory and execution host. Identically named
projects, branches, or task IDs do not identify the same service. Worktrees do not
automatically synchronize task files; editing the same task on separate branches
can still produce a Git merge conflict. The sidebar reads local editable tasks;
the upstream browser can additionally show other branches according to its own
configuration.

SSH services live inside the relay, and paired environments use the owning Orca
runtime. A disconnect means the remote process is **unverifiable**. It never
causes execution to fall back to the desktop. Older runtimes/relays without
`backlog.v1` display an update requirement.

## Processes and restoration

- A shared `backlog task list --json --watch` process supplies sidebar snapshots.
  Successive complete JSON objects replace the previous list. Unsupported
  `--watch` falls back to one-shot JSON reads every five seconds while subscribed.
- Task details use `backlog task view <id> --json`. The adapter accepts JSON schema
  version 1 and ignores extra fields; incompatible output produces an error.
- Priority order is read once per subscription lifetime with `backlog config get
priorities` on the execution host. This optional read does not delay task loading;
  refreshing the sole subscriber or reopening the panel reads it again. Task ordinals
  and snapshot priorities are optional for compatibility with older runtimes.
- Opening the board starts `backlog browser --no-open --port <port>` on loopback.
  Concurrent opens share startup, and occupied ports are retried. Orca does not
  attach to or stop a separately launched Backlog.md server.
- Board consumers renew leases every 20 seconds. Explicit release starts a
  60-second idle shutdown; abandoned leases expire after 90 seconds first.
- Persisted board bindings identify the workspace and host. A restored tab starts
  blank and obtains a current server URL before navigation. The saved localhost
  port is not a restore target.

## Verification

Unit coverage includes JSON framing, process/lease lifetime, per-host routing,
sidebar subscription races, and browser binding persistence. Task handoff tests
cover project/host isolation, durable associations, fresh Markdown prompts,
worktree creation callbacks, ambiguous delivery, concurrent history restoration,
and Continue without resending. The optional real
CLI test creates temporary projects and starts a loopback server without opening
a browser:

```sh
ORCA_BACKGROUND_LAUNCH=1 ORCA_BACKLOG_INTEGRATION_TEST=1 pnpm exec vitest run --config config/vitest.config.ts src/main/backlog/backlog-cli.integration.test.ts
```

The initial integration was verified against Backlog.md 1.52.0. A sandbox that
denies listening sockets cannot run the HTTP part of this test.

Related conversation branching, exact context handoff, and return-result semantics are documented in [Conversation branching](conversation-branching.md).
