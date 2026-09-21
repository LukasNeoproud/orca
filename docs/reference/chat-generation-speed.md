# Chat generation speed

Structured Codex conversations retain generation metadata on the assistant message in
the host-owned journal. Local worktrees, folder workspaces and paired remote runtimes
use the same projection; client network latency is not part of the clock. The optional `generation`
field is an additive wire change that needs no protocol-version bump. Older hosts omit
it and older clients ignore it.

The displayed `≈ … tok/s` is an estimate of **non-reasoning output throughput**, not
whole-turn throughput or end-to-end latency:

- The numerator is the provider's response-scoped `tokenUsage.last.outputTokens`
  minus `reasoningOutputTokens`. Input, cached input and reasoning tokens are excluded.
  Characters and stream chunk counts are never used to estimate token counts.
- The denominator is execution-host monotonic time between the first and last
  non-empty assistant text deltas in the corresponding response window.
  Waiting for the first text delta, reasoning before prose, tool execution and
  waiting after the last delta are excluded.
- Tokens in the first chunk are included in the provider count, although that
  chunk begins the interval. Chunk batching and transport buffering can inflate
  or otherwise distort this estimate, especially for short replies. The UI always
  labels it as approximate; it is not server-measured decoding throughput.
- Standard and Fast use exactly the same formula. The model and requested service
  tier are captured for the turn, not read from the current composer when rendering
  history. A requested tier is not proof of the provider's billed or effective tier.
  A reported model reroute updates the recorded model and invalidates the mixed
  response window.

Only unambiguous completed response windows are measured. Missing or invalid token
counts, one-chunk output, tool-output mixtures, ambiguous message attribution and
interruptions do not produce a number. Imported history without captured stream timing
cannot be reconstructed into a rate. Legacy Codex transcripts, including direct SSH
conversations, expose the recorded model and service tier when available, with speed
unavailable. They do not substitute SSH delivery time for generation time. Other
providers and older hosts without this metadata retain their existing conversation display.

The event fields are checked against the installed Codex app-server generated JSON
schema. The [app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes streaming item events and thread token-usage notifications.
