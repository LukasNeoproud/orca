# Backlog.md integration

Orca uses the installed `backlog` executable on the workspace's execution host.
The package is named **backlog.md** (`npm install -g backlog.md`), not `backlog`.
There is no automatic installation, project initialization, or agent configuration.

Open **Backlog.md** from the tab bar's **+** menu, or use **Backlog** in the right
sidebar. The sidebar reads tasks, searches their IDs and titles, filters by status,
and previews descriptions and acceptance criteria. Create and edit tasks in the
full web board. Both entry points open the same board tab for that workspace.

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
sidebar subscription races, and browser binding persistence. The optional real
CLI test creates temporary projects and starts a loopback server without opening
a browser:

```sh
ORCA_BACKGROUND_LAUNCH=1 ORCA_BACKLOG_INTEGRATION_TEST=1 pnpm exec vitest run --config config/vitest.config.ts src/main/backlog/backlog-cli.integration.test.ts
```

The initial integration was verified against Backlog.md 1.52.0. A sandbox that
denies listening sockets cannot run the HTTP part of this test.
