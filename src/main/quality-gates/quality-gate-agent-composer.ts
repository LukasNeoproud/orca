import type { TerminalCursorContext } from '../../shared/terminal-composer-draft'
import { HeadlessEmulator } from '../daemon/headless-emulator'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

const CLAUDE_COMPOSER_RULE = /^─{8,}\s*$/
// Claude Code pads the glyph with a no-break space, which `\s` covers.
const CLAUDE_BARE_PROMPT = /^❯\s*$/

/**
 * Claude Code's input field with nothing typed in it: the cursor sits right after a bare `❯`
 * between the field's two rules. Dimmed text after the cursor is Claude Code's own suggestion or
 * placeholder, which a paste replaces; typed text is never dimmed.
 *
 * Written against the `claude-2-1-329-*` transcripts in `runtime/__fixtures__`.
 */
export function isClaudeComposerEmpty(context: TerminalCursorContext | null): boolean {
  if (!context || context.cursorHidden || context.rows.length < 2) {
    return false
  }
  return (
    CLAUDE_BARE_PROMPT.test(context.beforeCursor) &&
    context.afterCursor.trim() === '' &&
    CLAUDE_BARE_PROMPT.test(context.typedRows.at(-1) ?? '') &&
    CLAUDE_COMPOSER_RULE.test(context.rows.at(-2) ?? '') &&
    CLAUDE_COMPOSER_RULE.test(context.rowsBelow[0] ?? '')
  )
}

/** Only agents whose screen was captured have a rule; any other agent is never read as empty. */
const EMPTY_COMPOSER_RULES: Readonly<
  Record<string, (context: TerminalCursorContext | null) => boolean>
> = { claude: isClaudeComposerEmpty }

export function hasAgentComposerRule(agentType: string | undefined): boolean {
  return agentType !== undefined && Object.hasOwn(EMPTY_COMPOSER_RULES, agentType)
}

/** The cursor's surroundings on a serialized screen, with dimming kept apart from typed text. */
export async function readSnapshotCursorContext(snapshot: {
  data: string
  cols: number
  rows: number
}): Promise<TerminalCursorContext | null> {
  if (snapshot.data.length === 0) {
    return null
  }
  const emulator = new HeadlessEmulator({
    cols: snapshot.cols,
    rows: snapshot.rows,
    scrollback: 0
  })
  try {
    await emulator.write(`\x1b[2J\x1b[3J\x1b[H${snapshot.data}`)
    return emulator.getCursorLineContext()
  } finally {
    emulator.dispose()
  }
}

export type AgentComposerRuntime = Pick<OrcaRuntimeService, 'serializeAuthoritativeTerminalBuffer'>

/**
 * Whether the agent's input field provably holds nothing the user typed, read off the screen this
 * host keeps for the terminal. False whenever that cannot be shown: no rule for the agent, no
 * screen, or a screen the rule does not recognise.
 */
export async function isAgentComposerProvablyEmpty(
  runtime: AgentComposerRuntime,
  agentType: string | undefined,
  ptyId: string
): Promise<boolean> {
  if (agentType === undefined || !hasAgentComposerRule(agentType)) {
    return false
  }
  try {
    const snapshot = await runtime.serializeAuthoritativeTerminalBuffer(ptyId, {
      scrollbackRows: 0
    })
    return snapshot
      ? EMPTY_COMPOSER_RULES[agentType](await readSnapshotCursorContext(snapshot))
      : false
  } catch {
    return false
  }
}
