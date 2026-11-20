/**
 * The host will not start gates in this worktree at all, whoever asks. Not a failed gate and not
 * a lost one: nothing ran, and the message says what the user can change.
 */
export class QualityGateRunRefusedError extends Error {
  readonly code = 'quality_gate_run_refused'
}

/** Asked with the worktree id the host resolved; a string is the refusal shown to the caller. */
export type QualityGateRunRefusal = (worktreeId: string) => string | null
