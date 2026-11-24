/**
 * Which ticket a unit of work belongs to: the one attached to its workspace, else the key in its
 * branch name, else the key in the title of its pull request.
 */

import { JIRA_ISSUE_KEY_PATTERN } from '../jira-issue-url'

export type WorkTicketKeySource = 'linked' | 'branch' | 'pull-request-title'

export type WorkTicketKeyOptions = {
  /**
   * Project keys the tracker has. With them only their keys count, in any letter case; without
   * them only an upper-case key counts, so `utf-8` in a branch name is not taken for a ticket.
   */
  projectKeys?: readonly string[] | null
  /** Project of a bare number that starts the last part of a branch name (`feature/123-login`). */
  branchNumberProjectKey?: string | null
}

/** The fields of a workspace attachment this reads; any attachment list fits. */
export type LinkedTicketCandidate = {
  provider: string
  jiraIdentifier?: string | null
  identifier?: string | null
}

export type WorkTicketKey = { key: string; source: WorkTicketKeySource }

const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9]{1,9}$/
// A key stands alone: `XABC-12` and `ABC-12a` are longer words, not the ticket ABC-12.
const KEY_IN_TEXT = /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-([1-9][0-9]{0,6})(?![A-Za-z0-9])/g
const LEADING_NUMBER = /^([1-9][0-9]{0,6})(?:[-_]|$)/

function knownProjects(options: WorkTicketKeyOptions | undefined): Set<string> | null {
  const projects = (options?.projectKeys ?? []).map((key) => key.trim().toUpperCase())
  return projects.length > 0 ? new Set(projects) : null
}

/** The first ticket key in free text such as a pull request title. */
export function readTicketKeyFromText(
  text: string | null | undefined,
  options?: WorkTicketKeyOptions
): string | null {
  const projects = knownProjects(options)
  for (const match of (text ?? '').matchAll(KEY_IN_TEXT)) {
    const project = match[1].toUpperCase()
    if (projects ? projects.has(project) : match[1] === project) {
      return `${project}-${match[2]}`
    }
  }
  return null
}

export function readTicketKeyFromBranch(
  branch: string | null | undefined,
  options?: WorkTicketKeyOptions
): string | null {
  const name = (branch ?? '').replace(/^refs\/heads\//, '')
  const key = readTicketKeyFromText(name, options)
  if (key) {
    return key
  }
  const project = options?.branchNumberProjectKey?.trim() ?? ''
  const number = LEADING_NUMBER.exec(name.slice(name.lastIndexOf('/') + 1))
  return number && PROJECT_KEY.test(project) ? `${project.toUpperCase()}-${number[1]}` : null
}

function readLinkedTicketKey(linked: readonly LinkedTicketCandidate[]): string | null {
  for (const item of linked) {
    const key = (item.jiraIdentifier ?? item.identifier ?? '').trim()
    if (item.provider === 'jira' && JIRA_ISSUE_KEY_PATTERN.test(key)) {
      return key.toUpperCase()
    }
  }
  return null
}

/** A ticket the user attached wins over anything read from a name. */
export function resolveWorkTicketKey(
  work: {
    linked?: readonly LinkedTicketCandidate[] | null
    branch?: string | null
    pullRequestTitle?: string | null
  },
  options?: WorkTicketKeyOptions
): WorkTicketKey | null {
  const linked = readLinkedTicketKey(work.linked ?? [])
  if (linked) {
    return { key: linked, source: 'linked' }
  }
  const fromBranch = readTicketKeyFromBranch(work.branch, options)
  if (fromBranch) {
    return { key: fromBranch, source: 'branch' }
  }
  const fromTitle = readTicketKeyFromText(work.pullRequestTitle, options)
  return fromTitle ? { key: fromTitle, source: 'pull-request-title' } : null
}
