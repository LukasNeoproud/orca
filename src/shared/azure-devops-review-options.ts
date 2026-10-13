export type AzureDevOpsReviewLanguage = 'cs' | 'en'
export type AzureDevOpsReviewDepth = 'static' | 'build' | 'build-and-test'
export type AzureDevOpsReviewCheck = 'lint' | 'full-test-suite' | 'dependency-audit' | 'security'
/** Where the agent runs: its own TUI (auto mode, chat/terminal toggle) or Orca's structured chat. */
export type AzureDevOpsReviewSurface = 'terminal' | 'chat'

export type AzureDevOpsReviewOptions = {
  language: AzureDevOpsReviewLanguage
  depth: AzureDevOpsReviewDepth
  checks: AzureDevOpsReviewCheck[]
  /** Free text for setup a check needs, e.g. "tests need Docker running". */
  instructions: string
  surface: AzureDevOpsReviewSurface
}

export const AZURE_DEVOPS_REVIEW_CHECKS: readonly AzureDevOpsReviewCheck[] = [
  'lint',
  'full-test-suite',
  'dependency-audit',
  'security'
]

export const DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS: AzureDevOpsReviewOptions = {
  language: 'cs',
  depth: 'static',
  checks: [],
  instructions: '',
  surface: 'terminal'
}

const MAX_INSTRUCTIONS_LENGTH = 4000

/** Accepts stored or remote input; anything unknown falls back to the defaults. */
export function normalizeAzureDevOpsReviewOptions(value: unknown): AzureDevOpsReviewOptions {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const defaults = DEFAULT_AZURE_DEVOPS_REVIEW_OPTIONS
  const checks = Array.isArray(input.checks)
    ? AZURE_DEVOPS_REVIEW_CHECKS.filter((check) => (input.checks as unknown[]).includes(check))
    : defaults.checks
  return {
    language:
      input.language === 'en' || input.language === 'cs' ? input.language : defaults.language,
    depth:
      input.depth === 'static' || input.depth === 'build' || input.depth === 'build-and-test'
        ? input.depth
        : defaults.depth,
    // A static review runs nothing, so checks that execute code do not apply to it.
    checks:
      input.depth === 'build' || input.depth === 'build-and-test'
        ? checks
        : checks.filter((check) => check === 'security'),
    instructions:
      typeof input.instructions === 'string'
        ? input.instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH)
        : defaults.instructions,
    surface: input.surface === 'chat' ? 'chat' : defaults.surface
  }
}

const DEPTH_LINES: Record<AzureDevOpsReviewDepth, string> = {
  static:
    'This is a static review: read the code and the diff only. Do not install dependencies, build, run tests or execute project code.',
  build:
    "Build the projects the change touches with the repository's own build commands (restore dependencies first if needed). Report build errors and new warnings caused by the change as drafts. Do not run tests.",
  'build-and-test':
    "Build the projects the change touches with the repository's own build commands (restore dependencies first if needed), then run the tests that cover the changed code. Report build errors, new warnings and failing tests caused by the change as drafts, with the failing command and the relevant output."
}

const CHECK_LINES: Record<AzureDevOpsReviewCheck, string> = {
  lint: "Run the repository's linters and format checks on the changed files and report new findings.",
  'full-test-suite':
    'Run the full test suite, not only the tests near the change; it may take a long time, so say when it starts and how long it took.',
  'dependency-audit':
    "Audit dependencies the change adds or upgrades for known vulnerabilities and license problems with the ecosystem's audit tool (this needs network access).",
  security:
    'Make a dedicated security pass: injection, authentication and authorization, secrets in code or logs, unsafe deserialization and input validation.'
}

/** Prompt lines that carry the reviewer's choices; empty instructions add nothing. */
export function azureDevOpsReviewOptionLines(options: AzureDevOpsReviewOptions): string[] {
  const lines = [
    options.language === 'cs'
      ? 'Write every draft comment in Czech; keep code, identifiers and quoted output as they are.'
      : 'Write every draft comment in English.',
    DEPTH_LINES[options.depth],
    ...options.checks.map((check) => CHECK_LINES[check])
  ]
  if (options.depth !== 'static') {
    lines.push(
      'Commands may create build output and caches, but leave tracked files unchanged. If a command needs setup this machine lacks (a service, a credential, a tool), stop that check and report what is missing instead of working around it.'
    )
  }
  if (options.instructions) {
    lines.push(`Reviewer's setup notes (trusted, from the user): ${options.instructions}`)
  }
  return lines
}
