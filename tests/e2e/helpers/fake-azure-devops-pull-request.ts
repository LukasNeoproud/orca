import type { ElectronApplication } from '@stablyai/playwright-test'

/** Text of a file at `<commit>:/<path>`, or the HTTP status its request fails with. */
export type FakeAzureDevOpsFiles = Record<string, string | number>

export type FakeAzureDevOpsPullRequest = {
  repositoryId: string
  pullRequestId: number
  baseCommit: string
  sourceCommit: string
  title: string
  changes: { changeTrackingId: number; changeType: string; item: { path: string } }[]
  files: FakeAzureDevOpsFiles
  /** Source commits of the iterations before the latest, oldest first; `sourceCommit` is the latest. */
  earlierSourceCommits?: string[]
  /** Comment threads as the REST API returns them. */
  threads?: Record<string, unknown>[]
  /** The signed-in user's vote as the REST API stores it; a vote the app casts replaces it. */
  vote?: number
  /** Also answers the repository's list of active pull requests with this pull request. */
  listed?: boolean
}

/** One request the app made to the fake host, in the order they arrived. */
export type FakeAzureDevOpsRequest = { method: string; path: string; body: unknown }

type FakeAzureDevOpsState = {
  vote: number
  requests: FakeAzureDevOpsRequest[]
  postedThreads: Record<string, unknown>[]
  /** A new thread with this comment text fails with HTTP 500. */
  failingComment: string | null
}

// Why a global: a test changes a file's answer later to exercise a retry.
const FILES_GLOBAL = '__orcaE2eFakeAzureDevOpsFiles'
// Why a global: the app's writes change what the fake host answers next, and the test reads them.
const STATE_GLOBAL = '__orcaE2eFakeAzureDevOpsState'

/**
 * Answers the REST calls of one pull request's detail and of its files' text on the made-up
 * host `ado.invalid`, takes new comment threads and the signed-in user's vote, and records every
 * request; every other host goes to the real fetch.
 */
export async function serveFakeAzureDevOpsPullRequest(
  electronApp: ElectronApplication,
  pullRequest: FakeAzureDevOpsPullRequest
): Promise<void> {
  await electronApp.evaluate(
    (_electron, { fake, filesGlobal, stateGlobal }) => {
      const scope: Record<string, unknown> = globalThis
      scope[filesGlobal] = { ...fake.files }
      const state: FakeAzureDevOpsState = {
        vote: fake.vote ?? 0,
        requests: [],
        postedThreads: [],
        failingComment: null
      }
      scope[stateGlobal] = state
      const me = { id: 'me-guid-1', displayName: 'Me Example' }
      const realFetch = globalThis.fetch
      const json = (body: unknown, status = 200): Response =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' }
        })
      const pullRequestPath = `/_apis/git/repositories/${fake.repositoryId}/pullrequests/${fake.pullRequestId}`
      globalThis.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (url.hostname !== 'ado.invalid') {
          return realFetch(input, init)
        }
        const apiPath = url.pathname.toLowerCase()
        const method = (
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase()
        const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
        state.requests.push({ method, path: apiPath, body })
        if (apiPath.endsWith('/_apis/connectiondata')) {
          return json({ authenticatedUser: { id: me.id, providerDisplayName: me.displayName } })
        }
        if (apiPath.endsWith('/_apis/git/repositories/app')) {
          return json({ id: fake.repositoryId })
        }
        const pullRequest = {
          pullRequestId: fake.pullRequestId,
          title: fake.title,
          description: '',
          status: 'active',
          isDraft: false,
          creationDate: '2026-11-17T09:00:00Z',
          sourceRefName: 'refs/heads/feature/example',
          targetRefName: 'refs/heads/main',
          createdBy: { id: 'ada-guid', displayName: 'Ada Example' },
          reviewers: [{ id: me.id, vote: state.vote }]
        }
        if (apiPath.endsWith(pullRequestPath)) {
          return json(pullRequest)
        }
        if (
          fake.listed &&
          apiPath.endsWith(`/_apis/git/repositories/${fake.repositoryId}/pullrequests`) &&
          url.searchParams.get('searchCriteria.status') === 'active' &&
          !url.searchParams.has('searchCriteria.sourceRefName')
        ) {
          return json({ value: [pullRequest] })
        }
        if (method === 'PUT' && apiPath.endsWith(`${pullRequestPath}/reviewers/${me.id}`)) {
          const vote = body && typeof body === 'object' && 'vote' in body ? body.vote : null
          if (typeof vote !== 'number') {
            return json({ message: 'The fake host needs a numeric vote.' }, 400)
          }
          state.vote = vote
          return json({ id: me.id, displayName: me.displayName, vote })
        }
        if (method === 'POST' && apiPath.endsWith(`${pullRequestPath}/threads`)) {
          const comments =
            body && typeof body === 'object' && 'comments' in body ? body.comments : []
          const first: unknown = Array.isArray(comments) ? comments[0] : null
          const content =
            first && typeof first === 'object' && 'content' in first ? first.content : ''
          if (content === state.failingComment) {
            return json({ message: 'Fake failure 500' }, 500)
          }
          const id = 1000 + state.postedThreads.length
          state.postedThreads.push({
            ...(body && typeof body === 'object' ? body : {}),
            id,
            status: 'active',
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content,
                commentType: 'text',
                publishedDate: '2026-11-18T10:00:00Z',
                author: me
              }
            ]
          })
          return json({ id })
        }
        const sourceCommits = [...(fake.earlierSourceCommits ?? []), fake.sourceCommit]
        if (apiPath.endsWith(`${pullRequestPath}/iterations`)) {
          return json({
            value: sourceCommits.map((commitId, index) => ({
              id: index + 1,
              sourceRefCommit: { commitId },
              commonRefCommit: { commitId: fake.baseCommit },
              targetRefCommit: { commitId: fake.baseCommit }
            }))
          })
        }
        if (apiPath.endsWith(`${pullRequestPath}/iterations/${sourceCommits.length}/changes`)) {
          return json({ changeEntries: fake.changes })
        }
        if (apiPath.endsWith(`${pullRequestPath}/threads`)) {
          return json({ value: [...(fake.threads ?? []), ...state.postedThreads] })
        }
        if (apiPath.endsWith(`/_apis/git/repositories/${fake.repositoryId}/items`)) {
          const side = url.searchParams.get('versionDescriptor.version') ?? ''
          const itemPath = url.searchParams.get('path') ?? ''
          const files = scope[filesGlobal]
          const answer =
            files && typeof files === 'object'
              ? Object.entries(files).find(([key]) => key === `${side}:${itemPath}`)?.[1]
              : undefined
          if (typeof answer === 'number') {
            return json({ message: `Fake failure ${answer}` }, answer)
          }
          return typeof answer === 'string'
            ? json({ path: itemPath, content: answer, contentMetadata: { isBinary: false } })
            : json({ message: 'not found' }, 404)
        }
        return json({ message: 'not served by the test' }, 404)
      }
    },
    { fake: pullRequest, filesGlobal: FILES_GLOBAL, stateGlobal: STATE_GLOBAL }
  )
}

/** Every request the app made to the fake host so far, oldest first. */
export async function readFakeAzureDevOpsRequests(
  electronApp: ElectronApplication
): Promise<FakeAzureDevOpsRequest[]> {
  return electronApp.evaluate((_electron, stateGlobal) => {
    const scope: Record<string, unknown> = globalThis
    const state = scope[stateGlobal]
    return state &&
      typeof state === 'object' &&
      'requests' in state &&
      Array.isArray(state.requests)
      ? state.requests
      : []
  }, STATE_GLOBAL)
}

/** Makes the fake host refuse a new thread whose comment has this text; null accepts all again. */
export async function failFakeAzureDevOpsComment(
  electronApp: ElectronApplication,
  content: string | null
): Promise<void> {
  await electronApp.evaluate(
    (_electron, { stateGlobal, failingComment }) => {
      const scope: Record<string, unknown> = globalThis
      const state = scope[stateGlobal]
      if (state && typeof state === 'object') {
        Object.assign(state, { failingComment })
      }
    },
    { stateGlobal: STATE_GLOBAL, failingComment: content }
  )
}

/** Changes what the fake host answers for one file from now on. */
export async function setFakeAzureDevOpsFile(
  electronApp: ElectronApplication,
  key: string,
  answer: string | number
): Promise<void> {
  await electronApp.evaluate(
    (_electron, { filesGlobal, fileKey, fileAnswer }) => {
      const scope: Record<string, unknown> = globalThis
      const files = scope[filesGlobal]
      scope[filesGlobal] = {
        ...(files && typeof files === 'object' ? files : {}),
        [fileKey]: fileAnswer
      }
    },
    { filesGlobal: FILES_GLOBAL, fileKey: key, fileAnswer: answer }
  )
}
