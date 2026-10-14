# Claude Code mods: the remote-surface protocol Orca relies on

Claude Code mods (plugins whose `hooks/hooks.json` names `"modules"`) draw panes, a band above
the prompt, toasts and status lines. Headless (`claude -p`, the Agent SDK) they run their hooks
but draw nothing until a client attaches as a **remote surface**. Orca's structured Claude chat
attaches as one and draws what the mods return.

Everything here is `@internal` in the CLI and has no published schema. The shapes below were
read from the Claude Code **2.1.299** binary and confirmed against it with
`tests/tools/claude-mods-surface-probe.mjs` (Agent SDK 0.3.284). Re-run the probe after a CLI
update:

```bash
node tests/tools/claude-mods-surface-probe.mjs --out /tmp/probe.jsonl
node tests/tools/claude-mods-surface-probe.mjs --plugins notes,picker,notify,svg,band-meter,auto-pane \
  --scenario notify+notes+picker+svg+notify-clear
```

## Transport

- **Requests** (client → CLI) are ordinary control requests. The SDK has no public method for
  them; Orca sends them through the `Query`'s generic `request({ subtype, ... })`, which every
  public control method wraps, and reads `{ response }` back
  (`claudeQueryRawRequester` in `src/main/claude/claude-agent-sdk-control-requests.ts`).
- **Pushes** (CLI → client) arrive on the message stream as `{ type: 'system', subtype: 'ui_*' }`
  frames, each with `uuid` and `session_id`. The SDK passes unknown system subtypes through its
  iterator unchanged.
- A CLI without the protocol answers `Unsupported control request subtype: ui_attach`.

## Requests

Validation messages quoted from the binary give the exact fields.

| subtype         | fields Orca sends                                                                                                                                                  | answer                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `ui_attach`     | `surface: 'desktop'`, `client_id: 'orca'`, `answers` while a composer answers asks (optional `viewport`)                                                           | `{ surfaces: ['desktop'] }`                                     |
| `ui_detach`     | `client_id`                                                                                                                                                        | `{ detached, surfaces }`                                        |
| `ui_panes`      | `client_id`                                                                                                                                                        | the roster (below)                                              |
| `ui_render`     | `component` (`Pane` / `AbovePrompt`), `instance_id` (pane id or `above-prompt`), `props: {}`, `viewport: { columns, rows, isFullscreen? }`, `surface`, `client_id` | `{ tree, props, rewritten, hooked, drawn_by, client_modules? }` |
| `ui_press`      | `plugin`, `handle` (from the node's `press`), `key`, `href?`, `surface`                                                                                            | `{ handled, element? }`                                         |
| `ui_input`      | `plugin`, `handle`, `kind: 'change' \| 'submit'`, `value` (≤ 16 KiB), `key`, `component`, `instance_id`, `surface`                                                 | `{ handled, element?, value? }`                                 |
| `ui_select`     | `plugin`, `handle`, `value` (one of the options), `key`, `component`, `instance_id`, `surface`                                                                     | `{ handled, element?, value? }`                                 |
| `ui_pane_show`  | `id`                                                                                                                                                               | `{ shown_id }`                                                  |
| `ui_pane_focus` | `id` or `null` (keyboard back to the composer)                                                                                                                     | `{ focused_id }`                                                |
| `ui_close`      | `id`                                                                                                                                                               | `{ closed }` — `false` when a `ui.close` hook kept it open      |
| `ui_scroll`     | `component`, `instance_id`, `offset`, `by`, `body_rows`, `content_rows`, `pointer?`, `keyed?`                                                                      | `{ moved, offset, deny?, follow_end? }`                         |
| `ui_focus`      | `component`, `instance_id`, `is_held`, `element?`, `by?`                                                                                                           | `{ moved, element }`                                            |

Phase 2 and 3 requests (including the four Client subtypes) are in the sections below. The
engine → client asks Orca answers (`ui_copy`, `ui_prompt_read`, `ui_prompt_fill`,
`ui_prompt_suggest`) are under [Engine → client asks](#engine--client-asks). Not used yet:
`ui_prompt_edit`, `ui_prompt_autocomplete` and the `ui_read_selection` ask (Desktop answers neither
of the last two).

Observed behaviour:

- A session with no hooks module answers `ui_render` with
  `{ tree: { type: 'engine', ref: 0 }, hooked: false, drawn_by: [] }`.
- Every `ui_render` hands out new handles; a press on a handle from an older drawing answers
  `{ handled: false }` and runs nothing. A press alone does not retire handles.
- A slash command a mod registered (`$.command.register`) is typed as an ordinary user message
  (`/hello-tabs`). It produces a `result` frame with `local_command: 'custom'` and `num_turns: 0`,
  so no model turn is spent.
- `ui_attach` pushes the current `ui_panes` roster straight away; a pane opened before the
  attach is still read with `ui_panes` on mount.

## Pushes

```jsonc
{ "type": "system", "subtype": "ui_invalidate", "event": "ui.render",
  "instances": [{ "surface": "desktop", "component": "Pane", "instance_id": "board" }]? }
{ "type": "system", "subtype": "ui_panes",
  "panes": [{ "id": "hello-tabs", "title": "Hello tabs", "plugin": "hello-tabs",
              "close_on_escape": true, "hold_toasts"?: true, "rows"?: n, "columns"?: n }],
  "shown_id": "hello-tabs", "focused_id": null, "focus_requested_id": "hello-tabs" }
{ "type": "system", "subtype": "ui_toast",  "plugin": "notify", "text": "…", "timeout_ms": 4000 }
{ "type": "system", "subtype": "ui_status", "plugin": "notify", "text": "…" | null }
{ "type": "system", "subtype": "ui_log",    "plugin": "notify", "text": "…" }
```

`ui_scroll` and `ui_focus` pushes are plugin-initiated moves; see Phase 2.

`ui_invalidate.instances` is an array of **objects** `{ surface, component, instance_id }` in
2.1.299 (live probe, after a `ui_client_fault`). Older text and builds used bare id strings.
The host (`readInvalidatedInstances` in `claude-mods-surface-push.ts`) accepts both, keeps entries
whose `surface` is absent or `desktop`, and hands the renderer `instances: string[]` of instance
ids, deduplicated. When the field is absent or nothing parseable remains it omits `instances`,
which means redraw everything; the CLI documents that as always correct.

## Engine → client asks

A plugin's `$.ui.copy`, `$.prompt.read`, `$.prompt.fill` and `$.prompt.suggest` (and the CLI's own
prompt suggestion after a turn) reach a headless session's core, which asks an attached client. Read
from the 2.1.300 binary's schema text and confirmed live with
`node tests/tools/claude-mods-surface-probe.mjs --scenario prompt-asks` (fixture `prompt-asks`).

- **Opt-in**: `ui_attach` names `answers: ['ui_copy', 'ui_prompt_read', 'ui_prompt_fill',
'ui_prompt_suggest']`. The CLI asks only a client that named the subtype; one that never names
  any is never asked (`$.ui.copy` then answers `no-clipboard`, the prompt calls the empty box /
  false). A repeated `ui_attach` with a list (including `[]`) replaces the earlier one; an absent
  field keeps it.
- **Transport**: each ask is an ordinary inbound `control_request` on the CLI's stdout, answered
  with a `control_response` under its `request_id`. The SDK has no handler for these subtypes and
  answers an error, which the CLI reads as "another client refused" and waits on; unanswered for
  5 s, or unparsable, it resolves the plugin's default. Orca wraps the `Query`'s
  `processControlRequest` (`claudeQueryUiAskInterceptor` in
  `src/main/claude/claude-mods-surface-ask-intercept.ts`); without that method it never names
  `answers`.
- No timestamp rides the ask over the pipes, so Desktop's 4 s staleness rule (it measures its page
  bridge's server time) is kept host-side: an ask unanswered 4 s after it reached the host is
  answered with the default, and a later answer is dropped.

| ask (`request`)                                                                                            | answer             | default                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------- |
| `ui_copy`: `surface`, `client_id`, `plugin`, `text`                                                        | `{ copied }`       | `{ copied: false }`       |
| `ui_prompt_read`: `surface`, `client_id`                                                                   | `{ text, cursor }` | `{ text: '', cursor: 0 }` |
| `ui_prompt_fill`: `surface`, `client_id`, `text`, `mode` (`replace` / `append` / `insert`), `decorations?` | `{ filled }`       | `{ filled: false }`       |
| `ui_prompt_suggest`: `surface`, `client_id`, `text`                                                        | `{ shown }`        | `{ shown: false }`        |

- `cursor` is a UTF-16 offset, `0..text.length`. After a fill the CLI sends `ui_prompt_read` at
  once and hands the plugin that box (`{ isFilled, text, cursor }`), so the read must already see
  the filled draft.
- The plugin sees `{ isCopied }`, `{ isFilled, text, cursor }`, `{ text, cursor }`, `{ isShown }`.

How Orca answers (Desktop's behaviour, translated):

- The host routes each ask to the composer that subscribed last for the session
  (`agentSession.claudeModsAsks`, a stream of `{ id, subtype, text?, mode? }` with the host's own
  `id`), and takes its answer through `agentSession.claudeModsAnswer`
  `{ sessionId, askId, response }`, checking the shape against the ask. Both need the runtime
  capability `agent-session.claude-mods.prompt-answers.v1`; an older host has neither and its
  client never listens. The host names `answers` only while a composer listens and the SDK can be
  intercepted, and withdraws them (`answers: []`) when the last composer leaves, so a chat with no
  composer gets the default at once instead of after 5 s. A CLI that refuses `answers` on
  `ui_attach` is attached again without it.
- Texts longer than 300,000 characters (under the CLI's 1,000,000, so an ask or a read fits one
  1 MiB RPC frame) get the default answer.
- Copy writes the app clipboard (`window.api.ui.writeClipboardText`).
- Read answers the composer's draft and caret.
- Fill is refused while a prompt card owns the composer (the composer is then unmounted, so the
  host answers the default), an IME composition is open, or a dialog is on screen; it places the
  text without moving focus. `decorations` are not painted.
- Suggest shows only in an empty composer with no attachments while no turn runs. It replaces the
  placeholder, shown on one line, and is dropped when a turn starts; Tab or ArrowRight with no
  modifier takes it, typing simply covers it.
- Remote and SSH sessions answer through the same two methods on the host that runs the session.

## Element tree

```jsonc
{
  "type": "Box",
  "props": { "flexDirection": "column" },
  "children": [
    {
      "type": "Button",
      "props": { "key": "tab-one", "label": "One", "hotkey": "1", "plain": true },
      "press": { "plugin": "hello-tabs", "handle": 784744199 }
    },
    { "type": "Text", "props": { "bold": true, "weight": "semibold" }, "children": ["…"] }
  ],
  "part": { "plugin": "hello-tabs" }
}
```

- Children ride beside `props`, never inside them. Strings are text; render them as text only.
- `press` sits on the node (Button, Input, Select, and a Markdown that answers its own links).
- `part.plugin` marks where one mod's drawing starts.
- `{ type: 'engine', ref }` means "core draws its own component here" (meaningful only at
  transcript sites).
- Elements on the desktop surface: `Box`, `Text`, `div`, `span`, `b`, `Button`, `Input`,
  `Select`, `Link`, `Code`, `Markdown`, `Svg`, `Client`. A Text's `key` prop is dropped by the
  engine.

## How Orca uses it

- `src/main/claude/claude-mods-surface-channel.ts` — one channel per structured Claude session.
  It outlives the session's children (a restart rebinds it), attaches only while a renderer
  subscribes, keeps the roster and status lines for a late subscriber, and keeps every `ui_*`
  push out of the transcript journal.
- `agentSession.claudeModsRequest` / `agentSession.claudeModsSubscribe`, negotiated with the
  runtime capability `agent-session.claude-mods.v1`, so a paired client and an older host simply
  draw nothing. `agentSession.claudeModsAsks` / `agentSession.claudeModsAnswer` carry the asks
  (`agent-session.claude-mods.prompt-answers.v1`); the renderer side is
  `use-native-chat-claude-mods-prompt-answers.ts` in the native-chat composer.
- `src/renderer/src/components/native-chat/claude-mods/` — the controller (redraw scheduling,
  presses), the element renderer, the pane dock and the band above the composer.
- Presses follow Claude Desktop (`claude-mods-press-queue.ts`): a press repeated while the same one
  is in flight is dropped (a press alone retires no handle, so a double click would run twice),
  and a keyed press on an older drawing moves to the newest handle with that unique key.
- A pane that asks for focus (`focus_requested_id`) while another holds it is shown when the
  person is not typing elsewhere; otherwise its tab gets a dot and the real holder is reported.
- A prompt a plugin submits (`$.prompt.submit`, `$.command.run`) reaches the transcript as a user
  row: the CLI replays it with `origin: { kind: "plugin" }` (`claude-plugin-submitted-prompt.ts`).
- Setting: **Settings → Chat → Claude Code mods** (`nativeChatClaudeMods`, absent means on).

## Phase 2: scroll, focus, keyed layout, hover

Read from the 2.1.299 binary and confirmed by live probes (`ui_scroll` / `ui_focus` push captures).
Each site (a Pane body or the band) is keyed `"<Component>:<instance_id>"` in the engine, which
owns the window offset; the client reports deltas and layout.

### Layout the client reports

- `ui_render` for `Pane` / `AbovePrompt` may carry `content_rows` (rows the whole tree laid out
  to, as last drawn) and `keyed: [{ plugin, key, top, bottom }]` (at most 512; `bottom` is the
  row past the last; rows are the monospace rows `offset` counts, first match wins, send in
  document order). Without `keyed`, a plugin's `$.ui.scroll({ to: { key } })` is denied; without
  `content_rows`, `to: "end"` does not know the last offset.
- The plugin-visible `props` for those sites carry `scroll: { offset, bodyRows }` (both
  non-negative integers) and, for a Pane, `isFocused`. The engine takes the whole `scroll` on the
  first report and afterwards only updates `bodyRows`; it keeps its own `offset`.
- Keyed elements: every Box with a string `key`, and every Button, Input and Select (`props.key`).
  A plugin is the element's `press.plugin`, or for a Box the nearest ancestor `part.plugin`.

### `ui_scroll` request (the person scrolled)

`{ component, instance_id, offset, by, body_rows, content_rows, pointer?: { column, row }, keyed? }`.
`by` is the signed row delta (what hooks see as `e.by`); the engine moves its own window and
ignores the request `offset` except to echo it for `no such site`. Requests in flight for one
instance are folded by the engine (the later fields win, `by` summed), so send them throttled to
a frame. Answer: `{ moved, offset, deny?, follow_end?: true }`; show `offset`. `follow_end` is
present only as `true`.

### `ui_scroll` push (a plugin scrolled)

`{ type: 'system', subtype: 'ui_scroll', client_id, component, instance_id, offset, follow_end?: true }`.
The engine has already resolved `to` / `key` / `block` to an absolute row; nothing but the offset
arrives. `to: "end"` is pushed twice, once without and once with `follow_end`. The person's own
scrolls are never pushed back. Orca forwards the frame (minus `uuid`, `session_id`, `type`) as the
renderer events `scroll` and `focus`.

`follow_end` (push or answer): keep the body pinned to its last row as it grows, until the person
or a plugin next moves it. A push or answer without it applies `offset` and ends following. The
client must keep sending fresh `content_rows` on every `ui_render`, because the engine derives its
own end offset from them while following. The request has no `follow_end`.

### `ui_focus` request and push

- Request: `{ component, instance_id, is_held, element?: { plugin, key } | null, by?: 'person' | 'auto' }`.
  `is_held` says whether DOM focus is inside the site; an absent `element` reports `is_held` alone.
  `by: 'auto'` marks an `autoFocus` element taking the ring as the site mounted.
  Answer: `{ moved, element: { plugin, key } | null, deny? }`; focus the element in the answer (a
  hook may redirect it).
- Push: `{ type: 'system', subtype: 'ui_focus', client_id, component, instance_id, plugin, key }`.
  `plugin` / `key` are the `press.plugin` and `props.key` of a Button, Input or Select. Sent only
  to a client that reported `is_held: true`, and not while the engine handles that site's own
  `ui_focus` report.

### Hover

Pure data: a node-level `hover` object beside `props` (Box, Text and Button only), plus
`group: { plugin }` when the hover names a `scope`. No request crosses to the engine; the client
applies the style from pointer position.

- Box keys: `scope`, `borderStyle`, `borderColor`, `borderDimColor`, `backgroundColor`, `display`
  (only `"flex"`, only on a Box drawn `display: "none"`), `top`/`left`/`right`/`bottom` (only on a
  Box with `position: "absolute"`). `borderStyle` needs an existing `borderStyle`.
- Text and Button-label keys: `scope`, `color`, `backgroundColor`, `dimColor`, `bold`, `italic`,
  `underline`, `strikethrough`, `inverse`.
- Context: the nearest keyed Box above (the Box itself counts), or a `scope` of 1 to 64 characters.
  A scope group is `(plugin, scope)`, lit while any member is hovered, in any site.

### Button, Markdown, hotkeys

Button props: `key`, `label`, `hotkey` (one `[0-9a-z]`, armed while the plugin's site holds focus),
`action` (engine keybinding; Orca ignores it), `plain`, `dimColor`, `variant`
(`primary` / `secondary`), `role: "dismiss"`, `autoFocus`. A Button may carry `children`
(strings and Text only); `label` names it. When two Buttons share a hotkey the later in drawing
order wins. A band taller than its window scrolls and arms no bare-digit hotkey.

## Phase 3: Client elements

A `Client` node runs a plugin's surface module in a sandbox on the client:
`{ type: 'Client', props: { key, module, props?, width?, height?, flexGrow? }, client: { plugin } }`.
`module` is the POSIX path under the plugin folder (`hooks/board.jsx`). The `ui_render` answer
carries `client_modules: { <plugin>: <hash> }`; a plugin absent there has no surface module and
its Clients draw a fault line. Modules load once per `(plugin, hash)`; a new hash remounts them.

Requests (all sent **without** `surface` / `client_id`; the CLI ignores them and the channel
omits them, checked live against 2.1.299):

| subtype            | fields                                                                                                                                  | answer                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ui_client_module` | `plugin`                                                                                                                                | `{ plugin, hash, modules: [{ module, entry, component }], runtime, limits, files: [{ key, source }] }` |
| `ui_client_press`  | `plugin`, `component`, `instance_id`, `client` (Client `props.key`), `module`, `element` (inner `props.key`), `event`                   | `{ handled, reached? }`                                                                                |
| `ui_message`       | `plugin`, `component`, `instance_id`, `client`, `module`, `data` (required, plain JSON, at most 100000 chars / 20000 values / depth 32) | `{ handled, props? }`                                                                                  |
| `ui_client_fault`  | same address, `phase: 'load' \| 'render' \| 'run'`, `reason` (required, at most 200 chars; truncate host-side)                          | `{ handled }`                                                                                          |

- `event` is `{ type: 'press' }`, `{ type: 'input', kind: 'change' | 'submit', value }` (value at
  most 16384 chars) or `{ type: 'select', value }`. The closure inside the frame runs only when
  the answer carries `reached`; `handled: true` without it means a hook withheld the event.
- `handled: false` from a press, message or fault means the latest `ui_render` of that instance
  did not carry that Client.
- `ui_message` answered with `props` is the instance's next props (state kept). The reference
  driver coalesces posts to one per frame.
- A fault is followed by a `ui_invalidate` for that instance (see the push shape above).
- `claude:surface-runtime` exports `h`, `Fragment` and `install(host, limits)`; call `install`
  once per frame global (a second call throws).
- Sandbox (`client/`): one `data:` module worker per `(plugin, hash)` (a `file://` renderer refuses
  `blob:` workers); the bootstrap makes `blob:` URLs for the served files itself. Before any plugin
  code runs it withholds the network, storage, timers, `eval`, `postMessage`/`close` and similar
  globals. A watchdog terminates the worker when a call exceeds its running-time budget (1 s per
  call, 5 s to load, 5 s stall). Only the instance whose call overran gets a `ui_client_fault`
  (every instance when the worker stalled or failed to load); its neighbours remount silently in a
  fresh worker.
  Specifiers the CLI did not link are rewritten to `orca-unlinked:` URLs that no worker resolves.
  A computed dynamic `import(expr)` is syntax and cannot be withheld; it relies on the CLI rewriting
  it to `surface-unlinked:///computed#...`, which resolves nowhere.
- Request size: `MAX_CLAUDE_MODS_REQUEST_BYTES` is 160 KiB so a full `ui_message` fits. A host that
  predates the four subtypes rejects them through its subtype enum; the renderer degrades to
  drawing nothing for Client nodes. A CLI without them answers `Unsupported control request subtype`.

## Phase 3: transcript sites

`ui_render` accepts every component name on the desktop surface; with no matching hook it answers
`{ tree: { type: 'engine', ref: 0 }, hooked: false, drawn_by: [] }`. Components:
`AskUserQuestion, UserMessage, AssistantMessage, ToolUse, ToolResult, ToolGroup, ToolProgress,
CommandOutput, Spinner, TurnDuration, InfoNotice, SessionMode, PromptHint, AbovePrompt, Pane`.
The binary raises all but `ToolProgress`, `TurnDuration` and `InfoNotice` on desktop (the plugin
d.ts says narrower for Spinner, PromptHint and AbovePrompt; trust the binary).

| component          | `instance_id`               | main props                                                                           |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------ |
| `UserMessage`      | Orca's stable row id        | `text`, `origin`, `isExpanded`, `task?`, `from?`                                     |
| `AssistantMessage` | message id (per text block) | `text` (markdown), `isFirstOfReply`, `isSummary?`                                    |
| `ToolUse`          | `tool_use_id`               | `tool_use_id`, `tool`, `input`, `isRunning`, `isErrored`, `isInterrupted`, `output?` |
| `ToolResult`       | `tool_use_id`               | `tool_use_id`, `tool`, `output`, `isErrored`                                         |
| `AskUserQuestion`  | `tool_use_id` of the call   | `tool`, `questions`, `metadataSource?`                                               |
| `ToolGroup`        | first call's `tool_use_id`  | the run's header calls                                                               |
| `Spinner`          | `main`                      | the working indicator's props                                                        |
| `CommandOutput`    | uuid of the output row      | `command`, `args`, `text`, `isErrored` (Orca does not draw it)                       |

The `UserMessage` id is Orca's own row id: Claude's user uuid is not available to the renderer
without growing the session view.

- `on_screen` (top-level request field, not a prop) `{ first, last, of }` or `null` reaches the hook
  as `props.onScreen` for UserMessage, AssistantMessage, ToolUse, ToolResult, ToolGroup,
  CommandOutput, TurnDuration, InfoNotice. Orca omits it (visibility is not tracked).
- Transcript asks are bounded to 120K characters of props (under the 160 KiB request limit); larger
  strings are cut and restored in the answer.
- `props.output` strings are cut at 65536 characters by the engine; cap larger objects host-side.
  `tool_use_id` is filled from `instance_id` for ToolUse and ToolResult when absent.
- A plugin may rewrite props (`rewritten: true`) only with the same value kinds and with the
  pinned fields unchanged (UserMessage `origin, isExpanded, task, from`; ToolUse/ToolResult
  `tool_use_id`; CommandOutput `command`; and others); otherwise the engine draws the original.

### Engine refs

`{ type: 'engine', ref }` means core draws its own component there. `ref: 0` draws the props the
client sent; any other ref draws `response.props`. The answer carries one props object, that of the
first engine node with a non-zero ref (depth first, not descending into Button, Input or Select).
A pass-through hook (one that only calls `next`, or only logs) also answers `ref 1` with
`rewritten: true` and lists the plugin in `drawn_by`, so `ref 1` does not imply changed props;
compare props when it matters (live probe: ToolGroup, TurnDuration, InfoNotice, PromptHint,
SessionMode, ToolProgress, non-Bash ToolUse, Spinner; `ref 0` appears only when no hook matched).
An engine node takes only `type` and `ref`, and never sits inside Text, Link or Button, nor under a
Box setting `display`, `overflow`, `position`, `width`, `height`, `minWidth`, `minHeight` or an
offset.

### AskUserQuestion rule

The tree must hold **exactly one** engine node and nothing may follow it in document order;
a mod may only add content above the dialog (at most 12 rows around it). A tree that breaks this
is refused and the native dialog is drawn. Answering never goes through `ui_render`: the choice
returns as the normal permission answer.

The pending prompt's journal question item carries `toolUseId` (optional, additive; written from
the Claude prompt registry's `toolUseId`) so the renderer can use it as `instance_id`. A renderer
reads it as `controller.prompts[0].body.toolUseId` when `body.kind === 'question'`; an older host
omits it, in which case the site is not offered to mods.
