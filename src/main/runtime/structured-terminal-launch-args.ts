import { recognizeAgentProcessFromCommandLine } from '../../shared/agent-process-recognition'
import { quoteStartupArg } from '../../shared/tui-agent-startup-shell'
import { tokenizeProcessCommandLine } from '../codex/codex-resume-process-proof'
import { resolveCodexStructuredAppServerArgv } from '../codex/codex-structured-app-server-args'
import { claudeSdkOptionsForLaunchArgs } from '../claude/claude-structured-launch-resolution'
import { StructuredTerminalAdoptionError } from '../native-chat/agent-session-wire/structured-agent-session-terminal-adoption'

const CODEX_SUBCOMMANDS = new Set([
  'exec',
  'e',
  'review',
  'login',
  'logout',
  'mcp',
  'mcp-server',
  'app-server',
  'app',
  'completion',
  'sandbox',
  'debug',
  'apply',
  'a',
  'fork',
  'cloud',
  'features',
  'help'
])

function codexConfigurationArgs(tokens: string[]): string[] {
  const result: string[] = []
  let resumed = false
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token === 'resume' && !resumed) {
      resumed = true
      // The open rollout proves the current thread; /resume need not update the original argv.
      if (tokens[index + 1] && !tokens[index + 1]!.startsWith('-')) {
        index += 1
      }
      continue
    }
    if (resumed && (token === '--last' || token === '--all')) {
      continue
    }
    if (!token.startsWith('-')) {
      if (
        CODEX_SUBCOMMANDS.has(token) ||
        token === 'resume' ||
        tokens.slice(index + 1).some((arg) => arg.startsWith('-'))
      ) {
        throw new Error('the prompt and command options cannot be separated safely')
      }
      // ps may remove argv quoting; a final prompt is already present in the proved rollout.
      break
    }
    try {
      result.push(...resolveCodexStructuredAppServerArgv([token]))
    } catch {
      result.push(...resolveCodexStructuredAppServerArgv([token, tokens[++index]!]))
    }
  }
  return result
}

/** Read the actual child argv, since a manually started agent need not use Orca's defaults. */
export function structuredTerminalLaunchArgs(input: {
  agent: 'claude' | 'codex'
  command: string
  providerSessionId: string
  platform?: NodeJS.Platform
}): string[] {
  const tokens = tokenizeProcessCommandLine(input.command, input.platform ?? process.platform)
  if (!tokens) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal launch arguments could not be verified.'
    )
  }
  const executableIndex = tokens.findIndex(
    (_token, index) =>
      recognizeAgentProcessFromCommandLine(
        tokens
          .slice(0, index + 1)
          .map((value) => quoteStartupArg(value, 'posix'))
          .join(' ')
      )?.agent === input.agent
  )
  if (executableIndex === -1) {
    throw new StructuredTerminalAdoptionError(
      'agent_session_identity_required',
      'The terminal agent command could not be verified.'
    )
  }
  const args = tokens.slice(executableIndex + 1)
  const resumeFlag = '--resume'
  const resume = args.indexOf(resumeFlag)
  if (input.agent === 'claude' && resume !== -1 && args[resume + 1] === input.providerSessionId) {
    args.splice(resume, 2)
  }
  try {
    if (input.agent === 'codex') {
      return codexConfigurationArgs(args)
    }
    claudeSdkOptionsForLaunchArgs(args)
    return args
  } catch (error) {
    throw new StructuredTerminalAdoptionError(
      'structured_agent_session_unsupported',
      `These terminal launch arguments cannot be preserved in structured chat: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
