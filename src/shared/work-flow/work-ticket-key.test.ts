import { describe, expect, it } from 'vitest'
import {
  readTicketKeyFromBranch,
  readTicketKeyFromText,
  resolveWorkTicketKey
} from './work-ticket-key'

describe('ticket key in a branch name', () => {
  it('reads the usual shapes', () => {
    const keyByBranch: [string, string][] = [
      ['APP-123', 'APP-123'],
      ['APP-123-add-sign-in', 'APP-123'],
      ['feature/APP-123-add-sign-in', 'APP-123'],
      ['feature/APP-123_add_sign_in', 'APP-123'],
      ['feature/APP-123', 'APP-123'],
      ['bugfix/APP-123/crash-on-start', 'APP-123'],
      ['users/jana/APP-123-add-sign-in', 'APP-123'],
      ['feature/add-sign-in-APP-123', 'APP-123'],
      ['feature/add_sign_in_APP-123', 'APP-123'],
      ['refs/heads/feature/APP-123-add-sign-in', 'APP-123'],
      ['hotfix/WEB2-7-typo', 'WEB2-7'],
      ['feature/APP-123-and-APP-124', 'APP-123']
    ]
    for (const [branch, key] of keyByBranch) {
      expect(readTicketKeyFromBranch(branch), branch).toBe(key)
    }
  })

  it('takes nothing that only looks like a key', () => {
    const branches = [
      'main',
      'feature/add-sign-in',
      'feature/utf-8-names',
      'chore/node-24',
      'release/2.4.0',
      'feature/XAPP-123a',
      'feature/APP-0123',
      'feature/A-12',
      'feature/123-add-sign-in'
    ]
    for (const branch of branches) {
      expect(readTicketKeyFromBranch(branch), branch).toBeNull()
    }
    expect(readTicketKeyFromBranch(null)).toBeNull()
  })

  it('reads lower case and skips foreign keys once the projects are known', () => {
    const options = { projectKeys: ['APP', 'web2'] }
    expect(readTicketKeyFromBranch('feature/app-123-add-sign-in', options)).toBe('APP-123')
    expect(readTicketKeyFromBranch('feature/Web2-7', options)).toBe('WEB2-7')
    expect(readTicketKeyFromBranch('feature/utf-8-names', options)).toBeNull()
    expect(readTicketKeyFromBranch('feature/UTF-8-names-APP-5', options)).toBe('APP-5')
    expect(readTicketKeyFromBranch('feature/SHA-256', options)).toBeNull()
    // Without the list an upper-case technical term is indistinguishable from a key.
    expect(readTicketKeyFromBranch('feature/SHA-256')).toBe('SHA-256')
  })

  it('reads a bare leading number only with the project it belongs to', () => {
    const options = { branchNumberProjectKey: 'app' }
    expect(readTicketKeyFromBranch('feature/123-add-sign-in', options)).toBe('APP-123')
    expect(readTicketKeyFromBranch('feature/123_add_sign_in', options)).toBe('APP-123')
    expect(readTicketKeyFromBranch('users/jana/123', options)).toBe('APP-123')
    expect(readTicketKeyFromBranch('123-add-sign-in', options)).toBe('APP-123')
    expect(readTicketKeyFromBranch('feature/add-step-2', options)).toBeNull()
    expect(readTicketKeyFromBranch('123/add-sign-in', options)).toBeNull()
    expect(readTicketKeyFromBranch('feature/2fa-setup', options)).toBeNull()
    expect(readTicketKeyFromBranch('feature/WEB-9-then-123', options)).toBe('WEB-9')
    expect(
      readTicketKeyFromBranch('feature/123-x', { branchNumberProjectKey: 'no key' })
    ).toBeNull()
  })
})

describe('ticket key in the title of a pull request', () => {
  it('reads the usual shapes', () => {
    const titles: [string, string][] = [
      ['APP-123: Add sign-in', 'APP-123'],
      ['[APP-123] Add sign-in', 'APP-123'],
      ['Add sign-in (APP-123)', 'APP-123'],
      ['feat(auth): add sign-in APP-123', 'APP-123'],
      ['APP-123 APP-124 Add sign-in', 'APP-123'],
      ['Merged PR 77: APP-123 add sign-in', 'APP-123']
    ]
    for (const [title, key] of titles) {
      expect(readTicketKeyFromText(title), title).toBe(key)
    }
    expect(readTicketKeyFromText('Add sign-in')).toBeNull()
    expect(readTicketKeyFromText('bump app-123 fixtures')).toBeNull()
    expect(readTicketKeyFromText(undefined)).toBeNull()
  })
})

describe('ticket of a unit of work', () => {
  const work = {
    linked: [
      { provider: 'github', identifier: 'ORG-1' },
      { provider: 'jira', jiraIdentifier: 'app-9', identifier: 'app-9' }
    ],
    branch: 'feature/APP-123-add-sign-in',
    pullRequestTitle: 'APP-200: Add sign-in'
  }

  it('prefers the ticket attached to the workspace, then the branch, then the title', () => {
    expect(resolveWorkTicketKey(work)).toEqual({ key: 'APP-9', source: 'linked' })
    expect(resolveWorkTicketKey({ ...work, linked: [] })).toEqual({
      key: 'APP-123',
      source: 'branch'
    })
    expect(resolveWorkTicketKey({ ...work, linked: null, branch: 'feature/add-sign-in' })).toEqual({
      key: 'APP-200',
      source: 'pull-request-title'
    })
    expect(resolveWorkTicketKey({ branch: 'main', pullRequestTitle: 'Add sign-in' })).toBeNull()
  })

  it('keeps an attached ticket of a project the list does not name', () => {
    expect(resolveWorkTicketKey(work, { projectKeys: ['WEB'] })).toEqual({
      key: 'APP-9',
      source: 'linked'
    })
  })

  it('skips an attachment that is not a tracker ticket', () => {
    const linked = [
      { provider: 'jira', jiraIdentifier: 'not a key' },
      { provider: 'azure-devops', identifier: 'APP-1' }
    ]
    expect(resolveWorkTicketKey({ linked, branch: 'main' })).toBeNull()
  })
})
