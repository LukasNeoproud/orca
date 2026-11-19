import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const WORKTREE_NOTE =
  'Without --worktree the workspace that contains the current directory is used.'
const DEFINITION_NOTE =
  'Gates are set up in the repository settings of the Orca app. No command defines or changes one.'

export const QUALITY_GATE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['gates', 'list'],
    summary: 'List the quality gates set up for the repository of a workspace',
    usage: 'orca gates list [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [WORKTREE_NOTE, DEFINITION_NOTE]
  },
  {
    path: ['gates', 'run'],
    summary: 'Run quality gates in a workspace and report the result of each',
    usage: 'orca gates run [<gate>...] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'gate'],
    positionalArgs: ['gate'],
    variadicPositional: true,
    repeatableFlags: ['gate'],
    notes: [
      'Name gates by id or name; without any, every gate runs in the order of the settings.',
      'The commands run in the workspace root on the host that owns the workspace.',
      'Waits for the runs and prints the result, exit code and end of the output of each gate.',
      'Exits 1 unless every required gate passed. A run whose outcome could not be observed is reported as unverifiable, not as failed.',
      'A gate that is already running in the workspace is not started twice; its run is reported.',
      'Stopping this command does not stop the runs: orca gates status reports them.',
      WORKTREE_NOTE,
      DEFINITION_NOTE
    ],
    examples: ['orca gates run', 'orca gates run lint tests --json']
  },
  {
    path: ['gates', 'status'],
    summary: 'Show the latest run of each quality gate and whether it is still current',
    usage: 'orca gates status [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'A result is stale once the workspace has another commit, a changed file, or the gate was edited.',
      WORKTREE_NOTE
    ]
  }
]
