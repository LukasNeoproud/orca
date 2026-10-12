import { useMemo, useState } from 'react'
import { Keyboard } from 'react-native'
import { getComposerRepoWorktreeBranches } from '../../../src/shared/composer-branch-selection'
import { parseJiraIssueUrl } from '../../../src/shared/jira-issue-url'
import { getProjectIdentityKey } from '../../../src/shared/project-host-setup-projection'
import { shouldPreserveWorkspaceSourceOnRepoChange } from '../../../src/shared/new-workspace/workspace-source'
import { deriveRepoSlug, type PasteRepoCandidate } from '../tasks/smart-source-paste-intent'
import { useMobileComposerSource } from '../tasks/use-mobile-composer-source'
import { useNewWorktreeRuntimeCapabilities } from '../tasks/worktree-create-capability'
import {
  buildRetiredWorktreeNamesRefreshKey,
  useRetiredWorktreeNames
} from '../worktree/use-retired-worktree-names'
import { BottomDrawerModalHost } from './bottom-drawer-modal-host'
import {
  getMobileWorkspaceRepoBadgeColor,
  type MobileWorkspaceRepo,
  type NewWorktreeModalProps
} from './new-worktree-modal-types'
import {
  buildNewWorkspaceProjectOptions,
  buildNewWorkspaceRunTargetOptions,
  getNewWorkspaceRunTarget
} from './new-workspace-project-targets'
import { NewWorktreeFormSheet } from './NewWorktreeFormSheet'
import { MobileAddProjectDrawer } from './MobileAddProjectDrawer'
import { MobileRunTargetSetup } from './MobileRunTargetSetup'
import { NewWorktreeModalDrawers } from './NewWorktreeModalDrawers'
import { NewWorktreeCheckoutRecoverySheet } from './NewWorktreeCheckoutRecoverySheet'
import { getNewWorktreeSourceAvailability } from './new-worktree-source-availability'
import { useNewWorkspaceAgentSelection } from './use-new-workspace-agent-selection'
import { useNewWorkspaceAdvancedOptions } from './use-new-workspace-advanced-options'
import { useNewWorkspaceCreateSubmit } from './use-new-workspace-create-submit'
import { useNewWorkspaceExecutionTarget } from './use-new-workspace-execution-target'
import { useNewWorkspaceRepositories } from './use-new-workspace-repositories'
import { useNewWorkspaceRuntimeContext } from './use-new-workspace-runtime-context'
import { useNewWorkspaceSetupScript } from './use-new-workspace-setup-script'
import { useNewWorktreeDrawerNavigation } from './use-new-worktree-drawer-navigation'
import { useMobileWorktreeLocation } from './use-mobile-worktree-location'
import { newWorktreeParentItems } from './new-worktree-parent-items'

export function NewWorktreeModal(props: NewWorktreeModalProps) {
  // Why: each drawer opening is a fresh form session; remounting resets local
  // form state before paint instead of clearing it in a visible-prop Effect.
  // State, not a ref: react-native-screens freezes a blurred screen by suspending
  // this subtree, and a counter bumped during a render React then throws away
  // would restart the session for an opening that never committed.
  const [session, setSession] = useState({ openEpoch: 0, visible: props.visible })
  if (session.visible !== props.visible) {
    setSession({
      openEpoch: props.visible ? session.openEpoch + 1 : session.openEpoch,
      visible: props.visible
    })
  }

  // Why: key the session on the HOST, never on the RpcClient object. A reconnect,
  // forceReconnect, or foreground revival swaps that object for the same host
  // (see useHostClient), and keying on it silently remounted this form mid-edit
  // and threw away the picked source. Every client-scoped hook below already
  // drops responses from a superseded client, so no remount is needed for that.
  return <NewWorktreeModalContent key={`${session.openEpoch}:${props.hostId}`} {...props} />
}

function NewWorktreeModalContent(props: NewWorktreeModalProps) {
  const {
    visible,
    client,
    hostId,
    existingWorktreePaths,
    existingWorktrees,
    openExternalUrl,
    onCreated,
    onClose,
    onPairHost
  } = props
  const { repos, selectedRepo, setSelectedRepo, loading, refreshRepos } =
    useNewWorkspaceRepositories({
      client,
      hostId,
      visible
    })
  const navigation = useNewWorktreeDrawerNavigation(visible)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const runtime = useNewWorkspaceRuntimeContext(client, visible, hostId)
  const { tasksSupported, hostPlatform, getWorktreeCreateCutoverSupport, getAgentLaunchSupport } =
    useNewWorktreeRuntimeCapabilities(client, visible)
  const selectedRepoConnectionId = selectedRepo?.connectionId ?? null
  const executionTarget = useNewWorkspaceExecutionTarget({
    client,
    connectionId: selectedRepoConnectionId,
    visible
  })
  const setupScript = useNewWorkspaceSetupScript({ client, selectedRepo })
  const advanced = useNewWorkspaceAdvancedOptions({ client, visible, repo: selectedRepo })
  const parentItems = useMemo(
    () => newWorktreeParentItems(existingWorktrees, selectedRepo),
    [existingWorktrees, selectedRepo]
  )
  const selectedParentId = parentItems.some((item) => item.id === advanced.parentWorktreeId)
    ? advanced.parentWorktreeId
    : null
  const selectedRepoWorktreeBranches = useMemo(
    () => getComposerRepoWorktreeBranches(existingWorktrees ?? [], selectedRepo?.id ?? null),
    [existingWorktrees, selectedRepo]
  )
  const composer = useMobileComposerSource({
    client,
    selectedRepoId: selectedRepo?.id ?? null,
    worktreeBranches: selectedRepoWorktreeBranches,
    onError: setError
  })
  const agentSelection = useNewWorkspaceAgentSelection({
    visible,
    runtimeSettings: runtime.runtimeSettings,
    detectedAgentIds: executionTarget.detectedAgentIds
  })
  const retiredNamesRefreshKey = useMemo(
    () => buildRetiredWorktreeNamesRefreshKey(existingWorktreePaths),
    [existingWorktreePaths]
  )
  const retiredWorktreeNames = useRetiredWorktreeNames(
    client,
    selectedRepo?.id,
    retiredNamesRefreshKey
  )
  const worktreeLocation = useMobileWorktreeLocation({
    client,
    repo: selectedRepo,
    name: composer.name,
    branchNameOverride: composer.branchNameOverride,
    baseRefOverride: advanced.baseRef,
    selection: composer.createSelection
  })
  const createSubmit = useNewWorkspaceCreateSubmit({
    client,
    selectedRepo,
    selectedAgent: agentSelection.selectedAgent,
    setSelectedAgent: agentSelection.setSelectedAgent,
    setAgentOverridden: agentSelection.setAgentOverridden,
    runtimeSettings: runtime.runtimeSettings,
    setRuntimeSettings: runtime.setRuntimeSettings,
    detectedAgentIds: executionTarget.detectedAgentIds,
    sshGate: executionTarget.sshGate,
    composer,
    worktreeLocation,
    note,
    advanced: {
      displayLabel: advanced.displayLabel,
      baseRef: advanced.baseRef,
      sparseCheckout: advanced.sparseCheckout,
      parentWorktreeId: advanced.parentWorktreeId === null ? null : (selectedParentId ?? undefined)
    },
    existingWorktreePaths,
    retiredWorktreeNames,
    setupCommand: setupScript.setupCommand,
    setupTrust: setupScript.setupTrust,
    setupRunPolicy: setupScript.setupRunPolicy,
    setupAgentStartupPolicy: setupScript.setupAgentStartupPolicy,
    setupDecisionChoice: setupScript.setupDecisionChoice,
    runSetup: setupScript.runSetup,
    trustedOrcaHooks: runtime.trustedOrcaHooks,
    setTrustedOrcaHooks: runtime.setTrustedOrcaHooks,
    getWorktreeCreateCutoverSupport,
    getAgentLaunchSupport,
    transitionDrawer: navigation.transitionDrawer,
    setError,
    onCreated,
    onClose
  })

  const selectedRepoIsGit = selectedRepo ? selectedRepo.kind !== 'folder' : true
  const sourceAvailability = getNewWorktreeSourceAvailability(
    selectedRepo,
    tasksSupported,
    runtime.availableProviders
  )
  const pasteRepos = useMemo<PasteRepoCandidate[]>(
    () =>
      repos.map((repo) => ({
        id: repo.id,
        displayName: repo.displayName,
        slug: deriveRepoSlug(repo)
      })),
    [repos]
  )
  const projectPickerItems = useMemo(() => buildNewWorkspaceProjectOptions(repos), [repos])
  const selectedProjectId = selectedRepo ? getProjectIdentityKey(selectedRepo) : null
  const selectedProject =
    projectPickerItems.find((project) => project.id === selectedProjectId) ?? null
  const runTargetPickerItems = useMemo(
    () => buildNewWorkspaceRunTargetOptions(repos, selectedProjectId, hostPlatform),
    [hostPlatform, repos, selectedProjectId]
  )
  const selectedRunTarget = selectedRepo
    ? getNewWorkspaceRunTarget(selectedRepo, hostPlatform)
    : null
  const needsSetupChoice = Boolean(setupScript.setupCommand) && setupScript.setupRunPolicy === 'ask'
  const unresolvedJiraUrl =
    parseJiraIssueUrl(composer.name) !== null && composer.linkedWorkItem?.provider !== 'jira'
  const canCreate =
    selectedRepo != null &&
    !unresolvedJiraUrl &&
    !createSubmit.creating &&
    !executionTarget.sshGate.requiresConnection &&
    (worktreeLocation.location === 'automatic' ||
      (worktreeLocation.preview != null &&
        !worktreeLocation.preview.occupyingWorktree &&
        !worktreeLocation.preview.destinationExists &&
        !worktreeLocation.pending)) &&
    (!needsSetupChoice || setupScript.setupDecisionChoice != null)

  function openPicker(view: 'project' | 'runTarget' | 'agent' | 'parent' | 'sparse'): void {
    Keyboard.dismiss()
    navigation.transitionDrawer(view)
  }

  function selectRepo(repo: MobileWorkspaceRepo, clearRepoScopedSource: boolean): void {
    const repoChanged = repo.id !== selectedRepo?.id
    setSelectedRepo(repo)
    if (
      clearRepoScopedSource &&
      repoChanged &&
      !shouldPreserveWorkspaceSourceOnRepoChange(composer.linkedWorkItem)
    ) {
      composer.handleClearSmartNameSelection()
    }
  }

  return (
    <BottomDrawerModalHost
      visible={visible}
      onRequestClose={() =>
        navigation.requestClose({
          hasRecoveredCheckout: Boolean(createSubmit.recoveredCheckout),
          openRecoveredWorkspace: createSubmit.openRecoveredWorkspace,
          closeSetupTrust: createSubmit.closeSetupTrust,
          onClose
        })
      }
    >
      <NewWorktreeFormSheet
        visible={navigation.formSheetVisible && !createSubmit.recoveredCheckout}
        interactive={navigation.formSheetInteractive}
        loading={loading}
        hasRepos={repos.length > 0}
        project={selectedProject}
        runTarget={selectedRunTarget}
        projectBadgeColor={selectedRepo ? getMobileWorkspaceRepoBadgeColor(selectedRepo) : null}
        selectedRepoIsGit={selectedRepoIsGit}
        selectedRepoConnectionId={selectedRepoConnectionId}
        selectedRepoName={selectedRepo?.displayName ?? 'Remote repository'}
        sshGate={executionTarget.sshGate}
        composer={composer}
        sourceIntentError={
          unresolvedJiraUrl ? 'Open Create From and select the Jira issue before creating.' : ''
        }
        worktreeLocation={worktreeLocation}
        selectedRepo={selectedRepo}
        selectedAgent={agentSelection.selectedAgent}
        showAdvanced={setupScript.showAdvanced}
        displayLabel={advanced.displayLabel}
        baseRef={advanced.baseRef}
        baseRefPlaceholder={
          composer.createSelection?.kind === 'branch' ||
          composer.createSelection?.kind === 'work-item'
            ? composer.createSelection.baseBranch ||
              selectedRepo?.worktreeBaseRef ||
              'Project default'
            : selectedRepo?.worktreeBaseRef || 'Project default'
        }
        parentName={parentItems.find((item) => item.id === selectedParentId)?.label ?? 'No parent'}
        sparseName={
          advanced.presets.find((preset) => preset.id === advanced.selectedPresetId)?.name ??
          'Full checkout'
        }
        sparseAvailable={advanced.canUseSparse}
        sparseLoading={advanced.presetsLoading}
        sparseError={advanced.presetsError}
        note={note}
        setupCommand={setupScript.setupCommand}
        setupSource={setupScript.setupSource}
        setupRunPolicy={setupScript.setupRunPolicy}
        setupAgentStartupPolicy={setupScript.setupAgentStartupPolicy}
        setupDecisionChoice={setupScript.setupDecisionChoice}
        runSetup={setupScript.runSetup}
        error={error}
        creating={createSubmit.creating}
        canCreate={canCreate}
        onClose={onClose}
        onOpenExternalUrl={openExternalUrl}
        onOpenProject={() => openPicker('project')}
        onOpenRunTarget={() => openPicker('runTarget')}
        onOpenSource={navigation.openSourceDrawer}
        onClearError={() => setError('')}
        onConnect={() => void executionTarget.connect()}
        onOpenAgent={() => openPicker('agent')}
        onShowAdvancedChange={setupScript.setShowAdvanced}
        onDisplayLabelChange={advanced.setDisplayLabel}
        onBaseRefChange={advanced.setBaseRef}
        onOpenParent={() => openPicker('parent')}
        onOpenSparse={() => openPicker('sparse')}
        onNoteChange={setNote}
        onSetupDecisionChange={setupScript.setSetupDecisionChoice}
        onRunSetupChange={setupScript.setRunSetup}
        onSetupAgentStartupPolicyChange={setupScript.setSetupAgentStartupPolicy}
        onCreate={() => void createSubmit.create()}
      />

      <NewWorktreeModalDrawers
        visible={visible}
        drawerView={navigation.drawerView}
        client={client}
        composer={composer}
        sourceAvailability={sourceAvailability}
        selectedRepo={selectedRepo}
        selectedProjectIdForJira={selectedProjectId}
        repos={repos}
        pasteRepos={pasteRepos}
        sshReady={!executionTarget.sshGate.requiresConnection}
        projectPickerItems={projectPickerItems}
        selectedProjectId={selectedProjectId}
        runTargetPickerItems={runTargetPickerItems}
        pickerAgentOptions={agentSelection.pickerAgentOptions}
        selectedAgent={agentSelection.selectedAgent}
        parentItems={parentItems}
        selectedParentId={selectedParentId ?? null}
        sparseItems={[
          { id: '__none__', label: 'Full checkout' },
          ...advanced.presets.map((preset) => ({
            id: preset.id,
            label: preset.name,
            detail: preset.directories.join(', ')
          }))
        ]}
        selectedSparseId={advanced.selectedPresetId}
        setupTrustPrompt={createSubmit.setupTrustPrompt}
        creating={createSubmit.creating}
        onSourceRepoChange={(repo) => selectRepo(repo, false)}
        onRepoChange={(repo) => selectRepo(repo, true)}
        onAddProject={() => navigation.transitionDrawer('addProject')}
        onSetupRunTarget={() => navigation.transitionDrawer('setupRunTarget')}
        onPairHost={
          onPairHost
            ? () => {
                onClose()
                onPairHost()
              }
            : undefined
        }
        onAgentChange={(agent) => {
          agentSelection.setAgentOverridden(true)
          agentSelection.setSelectedAgent(agent)
        }}
        onParentChange={advanced.setParentWorktreeId}
        onSparseChange={advanced.setSelectedPresetId}
        onTransitionToForm={() => navigation.transitionDrawer('form')}
        onApproveSetupTrust={(alwaysTrust) => void createSubmit.approveSetupTrust(alwaysTrust)}
        onSkipSetupTrust={createSubmit.skipSetupTrust}
        onCloseSetupTrust={createSubmit.closeSetupTrust}
      />
      <MobileAddProjectDrawer
        visible={visible && navigation.drawerView === 'addProject'}
        client={client}
        hostId={hostId}
        onClose={() => navigation.transitionDrawer('form')}
        onCreated={async (repo) => {
          if (
            repo.id !== selectedRepo?.id &&
            !shouldPreserveWorkspaceSourceOnRepoChange(composer.linkedWorkItem)
          ) {
            composer.handleClearSmartNameSelection()
          }
          await refreshRepos(repo.id)
          navigation.transitionDrawer('form')
        }}
      />
      <MobileRunTargetSetup
        visible={visible && navigation.drawerView === 'setupRunTarget'}
        client={client}
        selectedRepo={selectedRepo}
        hostPlatform={hostPlatform}
        onClose={() => navigation.transitionDrawer('form')}
        onReady={async (repoId) => {
          if (
            repoId !== selectedRepo?.id &&
            !shouldPreserveWorkspaceSourceOnRepoChange(composer.linkedWorkItem)
          ) {
            composer.handleClearSmartNameSelection()
          }
          await refreshRepos(repoId)
          navigation.transitionDrawer('form')
        }}
      />
      {createSubmit.recoveredCheckout ? (
        <NewWorktreeCheckoutRecoverySheet
          warning={createSubmit.recoveredCheckout.warning}
          prompt={createSubmit.recoveredCheckout.prompt}
          note={createSubmit.recoveredCheckout.note}
          onOpen={createSubmit.openRecoveredWorkspace}
        />
      ) : null}
    </BottomDrawerModalHost>
  )
}
