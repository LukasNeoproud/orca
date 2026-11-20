// Claude Code reports a pasted prompt to its UserPromptSubmit hook wrapped in this tag; the
// status store keeps the hook's text, so readers drop the tag before showing the prompt.
// Mirrored inline in mobile/src/worktree/agent-row-display.ts (single-file copy there).
const CLAUDE_PASTE_TAG = /\s*<\/?pasted_content(?: id="[^"<>\r\n]{1,64}")?>\s*/g

/** The status prompt as a reader shows it: Claude Code's paste tags removed, edges trimmed. */
export function agentStatusPromptDisplayText(prompt: string): string {
  if (!prompt.includes('pasted_content')) {
    return prompt.trim()
  }
  return prompt.replace(CLAUDE_PASTE_TAG, ' ').trim()
}
