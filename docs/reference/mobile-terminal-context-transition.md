# Host-driven terminal context transition

Status: verified design for TASK-29. This document defines the contract that must be
implemented before terminal context transitions can run without a desktop renderer.

## Decision

The runtime that owns the terminal control plane owns the transition. A desktop or
mobile client may request, observe, or cancel work before its effect boundary, but it
must not stop, spawn, claim, or complete the replacement process.

For a local desktop, paired runtime, or headless `orcad`, that owner is the runtime on
the execution host. For a direct SSH workspace, the client runtime remains the control
plane and the SSH relay owns the process operation. If either side is unreachable, the
result is `unverifiable`; another machine must not perform a local replacement.

The replacement keeps the existing `tabId` and `leafId`. It stops the exact source PTY
before it starts the destination PTY, so there is never a second live terminal bound to
the pane. A durable operation key at the process owner makes recovery inspect the first
attempt instead of spawning again.

This is an extension of the terminal transition path. Structured native chat already
uses a host-owned, idempotent conversation command and remains unchanged.

## Current source-to-contract map

| Concern | Current source | Verified behavior | Gap for Android or headless use |
| --- | --- | --- | --- |
| Request authority | [`agent-context-binding.ts`](../../src/main/runtime/agent-context-binding.ts) | A native session requires its exact spawn token. A terminal caller requires a live handle whose `tabId` and `leafId` form the supplied `paneKey`; the provider thread and PTY incarnation become the source generation. | The durable terminal target does not retain `ptyId`, execution-host identity, or a restart-stable pane binding version. |
| Safe boundary | [`agent-context-boundary.ts`](../../src/main/runtime/agent-context-boundary.ts) | The host waits for the captured turn, user-message frontier, subagents, approvals, questions, and continuation preparation to settle. A lost observation becomes `unverifiable`. | None; this guard should be reused immediately before the process effect. |
| Durable coordinator | [`agent-context-transition-service.ts`](../../src/main/runtime/agent-context-transition-service.ts), [`agent-context-transition-store.ts`](../../src/main/runtime/agent-context-transition-store.ts) | `queued`, `ready`, and `preparing` are replayable. The store writes `executing` before an external effect and restores it as `unconfirmed` after restart. | `executing` is deliberately not replayed, but there is no process-owner receipt to reconcile it. |
| Candidate preparation | [`agent-context-runtime.ts`](../../src/main/runtime/agent-context-runtime.ts) | The runtime prepares and claims the provider candidate. | The candidate is then handed to an in-memory renderer broker for terminal sessions. |
| Terminal effect | [`agent-context-terminal-surface.ts`](../../src/main/runtime/agent-context-terminal-surface.ts), [`use-agent-context-transition.ts`](../../src/renderer/src/components/terminal-pane/use-agent-context-transition.ts) | The exact renderer pane polls, claims after the host guard, restarts the process, and completes the claim. A claimed timeout is reported as outcome unknown. | The broker is memory-only and requires a mounted desktop pane. It cannot recover a claim after renderer or runtime failure. |
| Renderer restart | [`use-codex-conversation-pane-restart.ts`](../../src/renderer/src/components/terminal-pane/use-codex-conversation-pane-restart.ts), [`use-terminal-pane-process-exit-actions.ts`](../../src/renderer/src/components/terminal-pane/use-terminal-pane-process-exit-actions.ts) | The renderer verifies the provider session, builds the resume launch, destroys the old transport, spawns into the pane, then waits for the expected provider session. | Process ownership, tab mutation, and success confirmation live in renderer state. |
| Exact terminal identity | [`orca-runtime-build-pty-terminal-summary.ts`](../../src/main/runtime/orca-runtime-build-pty-terminal-summary.ts), [`stable-pane-id.ts`](../../src/shared/stable-pane-id.ts) | A live summary exposes `handle`, `ptyId`, `incarnationId`, `worktreeId`, `tabId`, and `leafId`. Handles are runtime-scoped; `paneKey = tabId:leafId` is the stable visual identity. | A handle alone cannot be the durable replacement identity. |
| Existing tab recovery | [`orca-runtime-resolve-terminal-pane.ts`](../../src/main/runtime/orca-runtime-resolve-terminal-pane.ts), [`orca-runtime-create-runtime-owned-mobile-session-terminal.ts`](../../src/main/runtime/orca-runtime-create-runtime-owned-mobile-session-terminal.ts) | The runtime can resolve a stable pane and can create a runtime-owned terminal with a specified tab and leaf. Host session bindings are persisted. | These APIs do not form one idempotent stop/rebind/start operation. |
| Client authentication | [`runtime-rpc-websocket-dispatch.ts`](../../src/main/runtime/runtime-rpc/runtime-rpc-websocket-dispatch.ts), [`agent-context.ts`](../../src/main/runtime/rpc/methods/agent-context.ts) | Mobile calls are bound to the validated paired device and a method allowlist. Remote agent-context calls require a negotiated capability. | Surface claim and completion are not bound to a pane owner and must not become mobile mutation APIs. |

The current terminal status lookup in
[`orca-runtime.ts`](../../src/main/runtime/orca-runtime.ts) selects only provider and
agent-status rows without a `connectionId`. A direct SSH terminal therefore has no
verified provider snapshot for this flow today. SSH support needs an owner-reported
projection from the selected relay; it cannot reuse a local status row.

Existing tests confirm the useful parts of this contract:

- `agent-context-binding.test.ts` covers the exact caller token, pane, provider, and
  source-generation checks.
- `agent-context-boundary.test.ts` covers stale input, owner changes, positive stop
  evidence, and `unverifiable` inspection.
- `agent-context-transition-service.test.ts` proves that pre-effect work resumes while
  an executing request becomes `unconfirmed` without replay.
- `agent-context-terminal-surface.test.ts` proves one claim and distinguishes an absent
  surface from a claimed effect with unknown outcome.
- `agent-context-structured-execution.test.ts` is the reference for a host-owned
  idempotent mutation with a durable fence and deterministic operation IDs.

## Ownership and exact identity

### Process owner

Use the owner that can both observe and mutate the process:

| Workspace | Coordinator | Process operation owner | Behavior without the viewer |
| --- | --- | --- | --- |
| Local desktop | Local runtime | Local PTY daemon/provider | Continue; renderer only reattaches to published state. |
| Paired desktop runtime | Paired runtime | Its local PTY daemon/provider | Continue after the phone disconnects. |
| Headless `orcad` | Headless runtime | Its local PTY daemon/provider | Continue without any viewer. |
| Direct SSH workspace | Client runtime | Remote relay for the selected SSH connection | Continue while connected. On disconnect, wait or reconcile; never run locally. |

Direct SSH and a paired runtime on the same machine are different execution hosts. They
must not inspect or take over one another's operations. This follows
[`ssh-execution-boundary.md`](./ssh-execution-boundary.md): the execution host owns
process truth, loss of contact is not evidence of exit, and the only process verdicts
are `live`, `unverifiable`, and `exited`.

### Durable binding

Capture this binding when accepting a terminal request:

```ts
type TerminalContextTransitionBindingV1 = {
  executionHost: {
    kind: 'local-runtime' | 'paired-runtime' | 'ssh-relay'
    id: string // canonical runtime environment or SSH connection identity
  }
  workspaceId: string
  tabId: string
  leafId: string
  paneKey: string
  source: {
    terminalHandle: string // useful only in the current runtime epoch
    ptyId: string
    incarnationId: string
    providerSessionId: string
    sourceGeneration: string
  }
}
```

Every field is conjunctive. `paneKey` locates the stable tab surface; `ptyId` plus
`incarnationId` identifies the process lifecycle; `providerSessionId` plus
`sourceGeneration` prevents replacing a later provider session that reused the pane;
`executionHost` prevents a remote failure from becoming a local action. The runtime
must re-resolve a current handle from the stable pane after restart and compare all the
other fields. It must never persist a handle and later treat it as sufficient proof.

Persist the destination binding with the same stable `tabId`, `leafId`, and `paneKey`,
plus the new `ptyId`, `incarnationId`, terminal handle, and provider session. The tab
exists throughout the transition. A client sees one tab whose process generation
changes, not a new tab.

## Process-owner operation

Add one internal provider operation, implemented by the local PTY owner and the SSH
relay:

```ts
type ReplaceTerminalConversation = {
  operationId: string
  expectedSource: TerminalContextTransitionBindingV1
  destination: {
    providerSessionId: string
    transcriptPath?: string
    launchConfigFingerprint: string
  }
}

type ReplacementInspection =
  | { state: 'not-started' }
  | { state: 'source-live'; source: ExactPtyIdentity }
  | { state: 'source-exited' }
  | { state: 'destination-live'; destination: ExactPtyIdentity }
  | { state: 'destination-exited'; destination: ExactPtyIdentity }
  | { state: 'unverifiable' }
```

`operationId` is derived deterministically from the transition request ID and purpose.
The process owner stores the operation before it stops the source. Repeating the same
ID and identical payload returns the existing record. Reusing it with another payload
is a conflict. This record must live at the layer that owns stop and spawn: a runtime
JSON record cannot disambiguate a lost relay or daemon reply.

The owner performs these ordered steps:

1. Compare the full expected source binding and acquire an exclusive pane-operation
   fence.
2. Fence new terminal input for that exact PTY incarnation.
3. Re-run the context boundary guard. Release the fence if it is stale, stopped, or no
   longer ready.
4. Persist `source-stop-requested`, stop the exact PTY incarnation, and obtain positive
   owner evidence that it exited.
5. Persist `source-exited` before spawn.
6. Spawn the prepared provider session into the same `tabId` and `leafId`; persist the
   destination identity before returning it.
7. Confirm that the destination reports the expected provider session. Atomically
   update the host session binding and session-tab snapshot.
8. Release the input fence for the destination and return `destination-live`.

There is no rollback to the old process after step 4. The old process has positively
exited. A spawn failure keeps the existing tab in a recoverable transition state and
uses the same operation ID on retry.

The provider operation must enforce at most one live PTY for this operation and stable
pane. It must reject a second operation while the pane fence exists. If inspection ever
finds two live candidates, it returns `unverifiable` and leaves both input-fenced for
explicit recovery; choosing one automatically could discard work.

## Claim and completion

The claim becomes an internal durable runtime lease rather than a public surface RPC.

```ts
type HostTransitionClaim = {
  requestId: string
  claimId: string
  coordinatorRuntimeId: string
  coordinatorEpoch: string
  claimGeneration: number
  stage: 'prepared' | 'effect-possible' | 'destination-bound'
}
```

- Claim while the request is `preparing`, after candidate preparation.
- Persist the claim and terminal binding before `markEffectPossible` changes the request
  to `executing`.
- A lease may be replaced after a coordinator crash only while the process owner says
  `not-started` or `source-live` with the exact original incarnation.
- After `effect-possible`, a new coordinator must inspect by `operationId`. It must not
  call spawn directly.
- Complete only after the destination binding and expected provider session are durable.
  `recordResult` must run before optional continuation input.
- Reject cancellation after the effect boundary. The status response should identify
  that the operation is already executing instead of pretending it was cancelled.

The existing `agentContext.surface`, `claimSurface`, and `completeSurface` methods stay
as a legacy desktop path only on hosts without the new capability. A host advertising
the new capability must not publish an offer, so an old renderer cannot race the host.
They should be removed after the supported skew window.

## Input and continuation safety

The pane-operation fence must participate in every write path, including JSON
`terminal.send`, binary terminal input, local renderer IPC, and internal
`sendTerminalAgentPrompt`. A write is either admitted to the exact source incarnation
before the fence, or rejected before any bytes are written. Rejection must use the
existing write-unavailable shape where possible; this avoids a new terminal stream
opcode. Clients retain or visibly reject unsent input and refresh the pane binding.

Input admitted before the fence changes the observed provider frontier and makes the
final boundary guard stale. Input after the fence never reaches the retiring process.
This is the condition that prevents lost input; merely disabling a mobile composer is
not an authority boundary.

For `continuation: 'continue'`, derive a second deterministic operation ID. Store the
destination result first, then submit the next step through a receipt-bearing prompt
write. On recovery:

- a durable accepted receipt completes the continuation without another write;
- positive evidence that no write began permits one retry;
- uncertain delivery yields `unconfirmed` with the destination result retained and no
  retry.

The current terminal continuation guard checks the replacement provider session and
user-message count, but its write is not durable across a crash. Receipt support is a
prerequisite for automatic continuation in the host-driven terminal path. Until it is
implemented, host-driven replacement may support `wait-for-user`; `continue` must fail
before the process effect or end as `unconfirmed` after an uncertain write.

## Recovery table

On startup, or after reconnecting to a process owner, reconcile every durable
`executing` terminal request before accepting another request for that pane.

| Owner inspection | Runtime action | Final meaning |
| --- | --- | --- |
| `not-started` | Re-run the boundary guard, then reacquire or fail before effect. | Safe to retry. |
| Exact `source-live` | Verify no destination exists; either resume the same operation or release the fence and fail before effect. | Safe because the captured incarnation is still authoritative. |
| `source-exited` | Resume destination spawn with the same operation ID and stable pane. | No duplicate source or destination. |
| Matching `destination-live` | Re-resolve its handle, bind it to the existing tab and leaf, verify the provider session, and record the result. | Replacement completed even if the reply was lost. |
| `destination-exited` with positive owner evidence | Keep the tab and result evidence; mark failed or `unconfirmed` according to whether any continuation/input could have landed. | Never auto-spawn a second destination. |
| `unverifiable` or owner unreachable | Keep the durable operation and tab, publish `unconfirmed`, and wait for the same owner. | No local fallback and no inferred exit. |
| Conflicting live process or binding | Input-fence the conflict and mark `unconfirmed`. | Manual recovery required. |

A direct SSH disconnect in any row becomes `unverifiable`. Reconnect to the same relay
and inspect the operation. If an Orca update makes the old relay unreachable, its PTY
and operation remain `unverifiable`; a new relay must not spawn a replacement from the
client-side record. Users who require unattended completion should use a paired or
headless runtime on that host.

## Authorization scope

1. **Who may create a request:** keep the current caller binding. The agent process
   proves the exact native session spawn token or terminal handle and pane key. A paired
   viewer cannot manufacture this proof from a workspace or provider ID.
2. **What the request authorizes:** one transition of the captured source generation,
   under the host's current `agentContextAutonomy` policy. The checkpoint remains
   historical evidence and does not grant new permissions.
3. **Who executes:** only the runtime's internal coordinator may claim the operation.
   Do not put host claim or completion methods on the mobile allowlist.
4. **Who may observe:** a paired client may receive conversation-scoped, redacted status
   only after the runtime resolves that conversation inside a workspace visible to the
   authenticated device. Do not return transcript paths, spawn tokens, terminal
   commands, environment values, claim IDs, or PTY operation records.
5. **Who may cancel:** the original agent caller may cancel while pre-effect. A paired
   client may cancel a visible pending request only through a separate capability and
   before the effect boundary. Device identity comes from `RpcContext.pairedDeviceId`,
   never request params.
6. **What survives disconnect:** authorization is stored as the bounded request and
   exact captured source, not as a bearer token. Reconnection never widens workspace,
   process, or continuation authority.

The mobile method allowlist currently contains no `agentContext.*` methods and the
mobile client does not advertise the existing transition capability. Any mobile status
or cancellation UI therefore needs a deliberately scoped capability and allowlist
change. Host execution itself does not require a connected mobile client.

## Wire compatibility

Add `agent.context-terminal-host-transition.v1`. Do not reinterpret
`agent.context-transitions.v1`: deployed hosts use it for the renderer-owned surface
path.

Follow [`remote-wire-compatibility.md`](./remote-wire-compatibility.md):

- Keep existing request and status fields valid. Add status metadata only as optional
  JSON fields.
- Do not add a terminal stream opcode. Reuse the existing input-unavailable signal and
  existing session-tab publication with the same tab and leaf and a new PTY identity.
- Treat absent transition metadata as unknown. An old client cannot be assumed to know
  that a replacement is pending.
- Gate any new client action, including scoped mobile cancellation, on its own
  capability.
- Host execution is enabled by the host capability, not by a renderer claim. A new host
  sends no legacy surface offer. An old host continues the existing desktop-only path.

Expected mixed-version behavior:

| Host | Viewer | Result |
| --- | --- | --- |
| Old | Old desktop | Existing renderer claim/complete path. |
| Old | New desktop | New desktop may use the legacy path; it must not assume host ownership. |
| Old | New Android | Report host transition unsupported. Do not emulate it by creating a terminal. |
| New | Old desktop | Host performs the replacement; existing tab/PTY publication makes the renderer reattach. No surface offer is published. |
| New | Old Android | Replacement may run, but status metadata is absent to the viewer. Existing tab replacement must pass the old-client fixture before rollout. |
| New | New Android | Host performs it; Android observes optional status and refreshes the same tab binding. |
| New paired/headless host | No viewer | Host performs and reconciles it locally. |
| New client runtime | Old SSH relay | Do not use the host-driven path for that workspace; the relay lacks the idempotent operation. |

The session-tab channel is not covered by the current cross-version wire harness. Add a
fixture before enabling rollout; otherwise a host-published PTY replacement could break
an old mobile client despite adding no new field.

## Required contract tests

### Pure coordinator and process-owner contract

Add table-driven tests for these state transitions:

1. Two claims for one request yield one owner operation and one claim generation.
2. A stale pane, provider session, PTY ID, or incarnation fails before stop.
3. An input admitted before fencing makes the final guard stale; an input after fencing
   writes zero bytes.
4. A crash before the effect boundary permits a guarded retry.
5. A crash after stop but before the spawn reply inspects the same operation and starts
   at most one destination.
6. A lost success reply observes `destination-live`, binds the existing tab and leaf,
   and does not spawn again.
7. Unknown continuation delivery retains the destination result and never resends.
8. Cancel succeeds in `queued`, `ready`, or `preparing`; it cannot cancel
   `effect-possible`.
9. A conflicting operation or two live identities becomes `unconfirmed` with both
   writes fenced.
10. Store migration preserves old requests and treats missing terminal binding fields
    as legacy, never as authorization to discover a replacement target.

### Execution scenarios

| Scenario | Setup and fault | Required assertion |
| --- | --- | --- |
| Desktop, pane mounted | Request from exact Codex terminal while the renderer is attached. | Host completes without `surface` polling; renderer reattaches to the same tab and leaf. |
| Desktop, pane hidden | Hide or unmount the tab before readiness. | Host completes and a later mount attaches to the destination PTY. |
| Android-only paired host | Disconnect desktop UI, leave phone paired. | Host completes; phone observes the same tab ID and new incarnation. |
| Headless host | Run `orcad` with no clients through the transition. | Request completes and survives a viewer reconnect. |
| Phone disconnect | Drop the phone after the request is queued. | Paired/headless host completes; no client claim is required. |
| Runtime crash before stop | Restart runtime after durable claim but before owner effect. | Exact source remains live; coordinator retries once after guard. |
| Runtime crash after stop | Restart after owner records source exit. | Reconciliation creates or finds one destination in the existing pane. |
| Reply loss after spawn | Drop the owner response after destination creation. | Inspection returns the same destination; no duplicate terminal or prompt. |
| Direct SSH disconnect before stop | Drop the relay connection before effect. | Status is `unverifiable`; source is not declared exited and no local PTY is created. |
| Direct SSH disconnect after stop/spawn | Drop each response boundary in turn, then reconnect to the same relay. | Operation inspection converges on one recorded state and one destination. |
| SSH relay version mismatch | Reconnect with a client that cannot reach the old relay. | Remains `unverifiable`; a new relay performs no fallback spawn. |
| Concurrent input | Send desktop and mobile input around the fence. | Every accepted byte belongs to one incarnation; rejected writes report zero bytes. |

### Cross-version fixtures

Extend the compatibility suite with frozen old client and old host artifacts:

- new host to old desktop and old Android: same tab and leaf, changed `ptyId` and
  `incarnationId`, no required new field;
- old host to new client: absence of the host-transition capability disables Android
  initiation and retains desktop legacy behavior;
- new client runtime to old SSH relay: operation is refused before effect;
- optional status fields omitted, present, and unknown: omission remains unknown;
- no new binary opcode and no input frame while the pane-operation fence is active.

The rollout gate is the old-Android tab-replacement fixture. If the frozen client
cannot reattach safely, the host must defer the terminal transition while that client
owns the input floor and expose an unsupported/waiting status. It must not publish a
shape that the client misinterprets.

## Implementation sequence

1. Add the new capability, versioned durable terminal binding, store migration, and
   pure coordinator tests.
2. Add the local process-owner operation and input fence. Reuse the stable pane binding
   and session-tab publication.
3. Add the SSH relay operation and reconnect inspection. Keep it disabled for old
   relays.
4. Switch new hosts from the surface broker to internal claim/complete, retaining the
   legacy path behind capability detection.
5. Add continuation receipts, then enable terminal `continue` mode.
6. Add scoped read/cancel RPCs and Android presentation after host execution is proven.
7. Run the desktop, Android-only, headless, SSH fault-injection, and cross-version
   matrix before enabling the feature by default.

## Unresolved decisions

These choices need implementation-level evidence; they do not change the safety
boundary above:

1. **Operation journal location.** Confirm whether the local daemon and SSH relay can
   share a durable journal format. An in-memory relay record survives disconnect but
   not relay restart; that weaker case must remain `unverifiable` after restart.
2. **Input retention UX.** The host contract guarantees zero-byte rejection after the
   fence. Desktop and Android still need to prove that rejected text stays visible or
   is clearly reported instead of disappearing from the editor.
3. **Destination readiness signal.** Prefer the host agent-status projection if it can
   prove the expected provider session for headless and SSH terminals. Otherwise add a
   provider-side confirmation to the owner operation, not a renderer callback.
4. **Old mobile reattachment.** The frozen-client fixture decides whether no additional
   rollout gate is needed.
5. **Terminal continuation receipt.** Decide whether to extend the existing durable
   mutation receipt or add a provider-transcript operation marker. Automatic retry is
   forbidden until one of them distinguishes `not-started` from unknown delivery.
