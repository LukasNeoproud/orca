# Rich previews — design prototype

Interactive, isolated prototype of Codex chat link previews and Source Control review.
Uses Orca's canonical theme and existing shadcn primitives. All files and results are
fixtures; no workspace, remote host, external website or agent is accessed.

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm exec vite --config examples/rich-chat-prototype/vite.config.ts
```

Open http://127.0.0.1:4317. Build with:

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm exec vite build --config examples/rich-chat-prototype/vite.config.ts
```

Cases: everyday chat, 13 file formats, changed/missing/offline/large files, direct
edits versus scripts, image and code review. Click file headings for actions.
Image review supports synchronized zoom/scroll, drag-to-select and a keyboard
accessible preset selection. Comments can be queued and transferred to the chat
composer; sending appends a mock message without starting an agent.

PDF, Mermaid and report previews are fixture renderings for design discussion.
HTML is a local sandboxed sample; external web metadata is mocked. No snapshots,
MCP Apps, script change detection or real filesystem updates are implemented.
