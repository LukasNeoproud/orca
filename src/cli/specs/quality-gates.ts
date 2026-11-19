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
    usage: 'orca gates run [<gate>...] [--no-wait] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'gate', 'no-wait'],
    positionalArgs: ['gate'],
    variadicPositional: true,
    repeatableFlags: ['gate'],
    notes: [
      'Name gates by id or name; without any, every gate runs in the order of the settings.',
      'The commands run in the workspace root on the host that owns the workspace.',
      'Waits for the runs and prints the result, exit code and end of the output of each gate.',
      'Exits 1 unless every required gate passed. A run whose outcome could not be observed is reported as unverifiable, not as failed.',
      'A gate that is already running in the workspace is not started twice; its run is reported.',
      'With --no-wait, prints the run of each gate as soon as the host has queued it and exits 0; orca gates status follows the runs and orca gates cancel stops them.',
      'Stopping this command does not stop the runs: orca gates status reports them and orca gates cancel stops them.',
      WORKTREE_NOTE,
      DEFINITION_NOTE
    ],
    examples: [
      'orca gates run',
      'orca gates run lint tests --json',
      'orca gates run build --no-wait'
    ]
  },
  {
    path: ['gates', 'status'],
    summary: 'Show the latest run of each quality gate and whether it is still current',
    usage: 'orca gates status [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'A result is stale once the workspace has another commit, a changed file, or the gate was edited.',
      'Each line ends with the id of the run, the same id orca gates run prints.',
      WORKTREE_NOTE
    ]
  },
  {
    path: ['gates', 'cancel'],
    summary: 'Stop the quality gates running in a workspace',
    usage: 'orca gates cancel [<gate>...] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'gate'],
    positionalArgs: ['gate'],
    variadicPositional: true,
    repeatableFlags: ['gate'],
    notes: [
      'Name gates by id or name; without any, every running or queued gate of the workspace stops.',
      'A running command is stopped together with the processes it started; a queued one never starts. The run is recorded as cancelled.',
      'Prints what was stopped. When nothing was running, says so and exits 0.',
      WORKTREE_NOTE
    ],
    examples: ['orca gates cancel', 'orca gates cancel build --json']
  },
  {
    path: ['gates', 'loop'],
    summary: 'Turn the feedback loop of quality gates off for a workspace',
    usage: 'orca gates loop off [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'state'],
    positionalArgs: ['state'],
    notes: [
      'With the loop on, Orca runs the required gates when an agent finishes a step and sends what failed back to that agent.',
      'The loop is turned on per repository in the Orca app. This command only turns it off for one workspace; a chain in progress stops and the agent gets no further message.',
      'Turning it back on for the workspace is done in the Orca app; orca gates loop on is refused from the command line.',
      'orca gates status shows whether the loop is on and what it last did.',
      WORKTREE_NOTE
    ],
    examples: ['orca gates loop off', 'orca gates loop off --worktree id:repo::/work --json']
  }
]
