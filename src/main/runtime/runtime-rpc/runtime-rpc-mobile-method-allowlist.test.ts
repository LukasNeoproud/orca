import { describe, expect, it } from 'vitest'
import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'

describe('mobile Jira source RPC access', () => {
  it('allows authenticated issue reads without exposing Jira account or issue writes', () => {
    for (const method of ['jira.readStatus', 'jira.searchIssues', 'jira.getIssue']) {
      expect(MOBILE_RPC_METHOD_ALLOWLIST.has(method)).toBe(true)
    }
    for (const method of [
      'jira.connect',
      'jira.disconnect',
      'jira.createIssue',
      'jira.updateIssue'
    ]) {
      expect(MOBILE_RPC_METHOD_ALLOWLIST.has(method)).toBe(false)
    }
  })
})

describe('mobile agent conversation RPC access', () => {
  it('allows topic and context operations used by the mobile conversation view', () => {
    for (const method of [
      'agentSession.topicIndex',
      'agentSession.writeTopicIndex',
      'agentSession.requestHandoff',
      'agentContext.inspect',
      'agentContext.cancelPending'
    ]) {
      expect(MOBILE_RPC_METHOD_ALLOWLIST.has(method)).toBe(true)
    }
  })
})

describe('mobile worktree project setup RPC access', () => {
  it('allows project creation and setup on the paired host', () => {
    for (const method of [
      'repo.add',
      'repo.create',
      'repo.clone',
      'project.list',
      'projectHostSetup.list',
      'projectHostSetup.setupExistingFolder',
      'projectHostSetup.clone'
    ]) {
      expect(MOBILE_RPC_METHOD_ALLOWLIST.has(method)).toBe(true)
    }
  })
})
