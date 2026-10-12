// Fork additions; upstream's projectGroup.list and repo.* already sit in EXECUTION_HOST_METHODS.
export const MOBILE_RPC_PROJECT_METHODS = [
  'project.list',
  'projectHostSetup.list',
  'projectHostSetup.setupExistingFolder',
  'projectHostSetup.clone',
  'repo.add',
  'repo.clone',
  'repo.create'
] as const
