import { useCallback, useMemo, useRef, useState } from 'react'
import type { GitHubWorkItem } from '../../../src/shared/github/work-item-types'
import type { GitLabWorkItem } from '../../../src/shared/gitlab-types'
import type { LinearIssue } from '../../../src/shared/linear/issue-types'
import type { JiraIssue } from '../../../src/shared/jira-types'
import type { TaskSourceContext } from '../../../src/shared/task-source-context'
import {
  buildJiraWorkspaceSource,
  getWorkspaceSourceName
} from '../../../src/shared/new-workspace/workspace-source'
import { resolveGitHubWorkItemIdentity } from '../../../src/shared/new-workspace/github-work-item-identity'
import { getForkPushWarning } from '../../../src/shared/new-workspace/fork-push-warning'
import type { RpcClient } from '../transport/rpc-client'
import {
  buildGitHubLinkedWorkItem,
  buildGitLabLinkedWorkItem,
  buildLinearLinkedWorkItem,
  buildSmartNameSelection,
  resolveComposerBranchPick,
  resolveComposerCreateSelection,
  resolveMobileComposerBranchOverride,
  resolveSelectedLinearName,
  resolveWorkItemAutoName
} from './composer-linked-work-item'
import {
  resolveComposerMrBase,
  resolveComposerPrBase,
  type ComposerHostedBase
} from './composer-source-base-resolve'
import type {
  ComposerBaseState,
  MobileComposerCreateSelection,
  MobileLinkedWorkItem
} from './mobile-composer-source-types'
import { useMobileComposerName } from './use-mobile-composer-name'
const EMPTY_BASE: ComposerBaseState = {}

export type UseMobileComposerSourceArgs = {
  client: RpcClient | null
  selectedRepoId: string | null
  worktreeBranches?: readonly string[]
  onError?: (message: string) => void
}

export function useMobileComposerSource(args: UseMobileComposerSourceArgs) {
  const { client, selectedRepoId, worktreeBranches = [], onError } = args
  const [linkedWorkItem, setLinkedWorkItem] = useState<MobileLinkedWorkItem | null>(null)
  const [base, setBase] = useState<ComposerBaseState>(EMPTY_BASE)
  const [reuseEligibleBranch, setReuseEligibleBranch] = useState<string | null>(null)
  const [reuseSelectedBranch, setReuseSelectedBranch] = useState(false)
  const [forkPushWarning, setForkPushWarning] = useState<string | null>(null)
  const [resolvingBase, setResolvingBase] = useState(false)
  const [branchCreateIntent, setBranchCreateIntent] = useState(false)

  const branchSelectionRef = useRef<{ refName: string; localBranchName: string } | null>(null)
  const resolveTokenRef = useRef(0)

  const { name, setName, setNameState, lastAutoNameRef, applyAutoName, isNameAutoManaged } =
    useMobileComposerName(linkedWorkItem)

  const clearBaseAndBranch = useCallback(() => {
    branchSelectionRef.current = null
    setBranchCreateIntent(false)
    setBase(EMPTY_BASE)
    setReuseEligibleBranch(null)
    setReuseSelectedBranch(false)
    setForkPushWarning(null)
    setResolvingBase(false)
  }, [])

  const runBaseResolve = useCallback(
    (token: number, resolve: Promise<ComposerHostedBase>) => {
      setResolvingBase(true)
      void resolve
        .then((result) => {
          if (resolveTokenRef.current !== token) {
            return
          }
          setBase({
            baseBranch: result.baseBranch,
            compareBaseRef: result.compareBaseRef,
            pushTarget: result.pushTarget,
            branchNameOverride: result.branchNameOverride
          })
          setForkPushWarning(getForkPushWarning(result))
        })
        .catch((error: unknown) => {
          if (resolveTokenRef.current !== token) {
            return
          }
          setBase(EMPTY_BASE)
          onError?.(error instanceof Error ? error.message : 'Failed to resolve base branch.')
        })
        .finally(() => {
          if (resolveTokenRef.current === token) {
            setResolvingBase(false)
          }
        })
    },
    [onError]
  )

  const handleSmartGitHubItemSelect = useCallback(
    (item: GitHubWorkItem) => {
      const token = (resolveTokenRef.current += 1)
      const identity = resolveGitHubWorkItemIdentity(item)
      const repoId = item.repoId || selectedRepoId
      setLinkedWorkItem(
        buildGitHubLinkedWorkItem({
          type: identity.type,
          number: identity.number,
          title: item.title,
          url: item.url,
          repoId: item.repoId
        })
      )
      applyAutoName(
        resolveWorkItemAutoName({ ...identity, title: item.title, provider: 'github' }),
        name
      )
      clearBaseAndBranch()
      if (identity.type !== 'pr' || !client || !repoId) {
        return
      }
      runBaseResolve(
        token,
        resolveComposerPrBase({
          client,
          repoId,
          prNumber: identity.number,
          ...(item.branchName ? { headRefName: item.branchName } : {}),
          ...(item.baseRefName ? { baseRefName: item.baseRefName } : {}),
          ...(item.isCrossRepository !== undefined
            ? { isCrossRepository: item.isCrossRepository }
            : {})
        })
      )
    },
    [applyAutoName, clearBaseAndBranch, client, name, runBaseResolve, selectedRepoId]
  )

  const handleSmartGitLabItemSelect = useCallback(
    (item: GitLabWorkItem) => {
      const token = (resolveTokenRef.current += 1)
      const repoId = item.repoId || selectedRepoId
      setLinkedWorkItem(
        buildGitLabLinkedWorkItem({
          type: item.type,
          number: item.number,
          title: item.title,
          url: item.url,
          repoId: item.repoId
        })
      )
      applyAutoName(
        resolveWorkItemAutoName({
          type: item.type,
          number: item.number,
          title: item.title,
          provider: 'gitlab'
        }),
        name
      )
      clearBaseAndBranch()
      if (item.type !== 'mr' || !client || !repoId) {
        return
      }
      runBaseResolve(
        token,
        resolveComposerMrBase({
          client,
          repoId,
          mrIid: item.number,
          ...(item.branchName ? { sourceBranch: item.branchName } : {}),
          ...(item.baseRefName ? { targetBranch: item.baseRefName } : {}),
          ...(item.isCrossRepository !== undefined
            ? { isCrossRepository: item.isCrossRepository }
            : {})
        })
      )
    },
    [applyAutoName, clearBaseAndBranch, client, name, runBaseResolve, selectedRepoId]
  )

  function handleSmartLinearIssueSelect(issue: LinearIssue): void {
    resolveTokenRef.current += 1
    setLinkedWorkItem(buildLinearLinkedWorkItem(issue))
    const suggested = resolveSelectedLinearName({
      issue,
      currentName: name,
      lastAutoName: lastAutoNameRef.current,
      lookupTextIsQuery: !linkedWorkItem
    })
    if (suggested) {
      setNameState(suggested)
      lastAutoNameRef.current = suggested
    }
    clearBaseAndBranch()
  }

  function handleSmartJiraIssueSelect(issue: JiraIssue, sourceContext: TaskSourceContext): void {
    resolveTokenRef.current += 1
    const source = buildJiraWorkspaceSource(issue)
    setLinkedWorkItem({ ...source, jiraSourceContext: sourceContext })
    applyAutoName(getWorkspaceSourceName(source).seedName, name)
    clearBaseAndBranch()
  }

  const handleSmartBranchSelect = useCallback(
    (refName: string, localBranchName: string) => {
      resolveTokenRef.current += 1
      setLinkedWorkItem(null)
      setForkPushWarning(null)
      setBranchCreateIntent(false)
      setResolvingBase(false)
      const pick = resolveComposerBranchPick({
        refName,
        localBranchName,
        currentName: name,
        lastAutoName: lastAutoNameRef.current,
        worktreeBranches
      })
      setReuseEligibleBranch(pick.reuseEligibleBranch)
      setReuseSelectedBranch(pick.reuseSelectedBranch)
      setBase(pick.base)
      branchSelectionRef.current = { refName, localBranchName }
      if (pick.name !== undefined) {
        setNameState(pick.name)
        lastAutoNameRef.current = pick.lastAutoName ?? ''
      }
    },
    [name, worktreeBranches]
  )

  function handleSmartCreateBranch(branchName: string): void {
    resolveTokenRef.current += 1
    setLinkedWorkItem(null)
    clearBaseAndBranch()
    setNameState(branchName)
    lastAutoNameRef.current = branchName
    setBranchCreateIntent(true)
  }

  const handleClearSmartNameSelection = useCallback(() => {
    resolveTokenRef.current += 1
    setLinkedWorkItem(null)
    clearBaseAndBranch()
    setResolvingBase(false)
    if (name === lastAutoNameRef.current) {
      setNameState('')
      lastAutoNameRef.current = ''
    }
  }, [clearBaseAndBranch, name])

  const handleBranchNameOverrideChange = useCallback(
    (value: string) => {
      const next = resolveMobileComposerBranchOverride({ value, base, forkPushWarning })
      setBase(next.base)
      setForkPushWarning(next.forkPushWarning)
    },
    [base, forkPushWarning]
  )

  const smartNameSelection = buildSmartNameSelection({
    linkedWorkItem,
    baseBranch: base.baseBranch
  })

  const createSelection = useMemo<MobileComposerCreateSelection | null>(
    () =>
      resolveComposerCreateSelection({
        linkedWorkItem,
        base,
        branch: branchSelectionRef.current,
        reuseEligibleBranch,
        reuseSelectedBranch,
        branchCreateIntent,
        name
      }),
    [base, branchCreateIntent, linkedWorkItem, name, reuseEligibleBranch, reuseSelectedBranch]
  )

  return {
    name,
    setName,
    linkedWorkItem,
    branchNameOverride: base.branchNameOverride,
    handleBranchNameOverrideChange,
    reuseEligibleBranch,
    reuseSelectedBranch,
    setReuseSelectedBranch,
    forkPushWarning,
    resolvingBase,
    isNameAutoManaged,
    smartNameSelection,
    createSelection,
    handleSmartGitHubItemSelect,
    handleSmartGitLabItemSelect,
    handleSmartLinearIssueSelect,
    handleSmartJiraIssueSelect,
    handleSmartBranchSelect,
    handleSmartCreateBranch,
    handleClearSmartNameSelection
  }
}

export type MobileComposerSource = ReturnType<typeof useMobileComposerSource>
