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

| subtype | fields Orca sends | answer |
| --- | --- | --- |
| `ui_attach` | `surface: 'desktop'`, `client_id: 'orca'` (optional `viewport`, `answers`) | `{ surfaces: ['desktop'] }` |
| `ui_detach` | `client_id` | `{ detached, surfaces }` |
| `ui_panes` | `client_id` | the roster (below) |
| `ui_render` | `component` (`Pane` / `AbovePrompt`), `instance_id` (pane id or `above-prompt`), `props: {}`, `viewport: { columns, rows, isFullscreen? }`, `surface`, `client_id` | `{ tree, props, rewritten, hooked, drawn_by, client_modules? }` |
| `ui_press` | `plugin`, `handle` (from the node's `press`), `key`, `href?`, `surface` | `{ handled, element? }` |
| `ui_input` | `plugin`, `handle`, `kind: 'change' \| 'submit'`, `value` (≤ 16 KiB), `key`, `component`, `instance_id`, `surface` | `{ handled, element?, value? }` |
| `ui_select` | `plugin`, `handle`, `value` (one of the options), `key`, `component`, `instance_id`, `surface` | `{ handled, element?, value? }` |
| `ui_pane_show` | `id` | `{ shown_id }` |
| `ui_pane_focus` | `id` or `null` (keyboard back to the composer) | `{ focused_id }` |
| `ui_close` | `id` | `{ closed }` — `false` when a `ui.close` hook kept it open |
| `ui_scroll` | `component`, `instance_id`, `offset`, `by`, `body_rows`, `content_rows`, `pointer?`, `keyed?` | `{ moved, offset, deny?, follow_end? }` |
| `ui_focus` | `component`, `instance_id`, `is_held`, `element?`, `by?` | `{ moved, element }` |

Not used yet: `ui_client_module`, `ui_client_press`, `ui_message`, `ui_client_fault` (`Client`
elements), `ui_prompt_edit`, `ui_prompt_autocomplete`, and the engine → client requests a client
opts into with `answers` (`ui_copy`, `ui_prompt_read`, `ui_prompt_fill`, `ui_prompt_suggest`,
`ui_read_selection`).

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
{ "type": "system", "subtype": "ui_invalidate", "event": "ui.render", "instances": ["…"]? }
{ "type": "system", "subtype": "ui_panes",
  "panes": [{ "id": "hello-tabs", "title": "Hello tabs", "plugin": "hello-tabs",
              "close_on_escape": true, "hold_toasts"?: true, "rows"?: n, "columns"?: n }],
  "shown_id": "hello-tabs", "focused_id": null, "focus_requested_id": "hello-tabs" }
{ "type": "system", "subtype": "ui_toast",  "plugin": "notify", "text": "…", "timeout_ms": 4000 }
{ "type": "system", "subtype": "ui_status", "plugin": "notify", "text": "…" | null }
{ "type": "system", "subtype": "ui_log",    "plugin": "notify", "text": "…" }
```

`ui_scroll` and `ui_focus` pushes (plugin-initiated moves) are forwarded but not drawn yet.

## Element tree

```jsonc
{ "type": "Box", "props": { "flexDirection": "column" },
  "children": [
    { "type": "Button", "props": { "key": "tab-one", "label": "One", "hotkey": "1", "plain": true },
      "press": { "plugin": "hello-tabs", "handle": 784744199 } },
    { "type": "Text", "props": { "bold": true, "weight": "semibold" }, "children": ["…"] }
  ],
  "part": { "plugin": "hello-tabs" } }
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
  draw nothing.
- `src/renderer/src/components/native-chat/claude-mods/` — the controller (redraw scheduling,
  presses), the element renderer, the pane dock and the band above the composer.
- Setting: **Settings → Chat → Claude Code mods** (`nativeChatClaudeMods`, absent means on).
