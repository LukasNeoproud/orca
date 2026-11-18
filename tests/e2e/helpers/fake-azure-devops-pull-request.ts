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
}

// Why a global: a test changes a file's answer later to exercise a retry.
const FILES_GLOBAL = '__orcaE2eFakeAzureDevOpsFiles'

/**
 * Answers the REST calls of one pull request's detail and of its files' text on the made-up
 * host `ado.invalid`; every other host goes to the real fetch.
 */
export async function serveFakeAzureDevOpsPullRequest(
  electronApp: ElectronApplication,
  pullRequest: FakeAzureDevOpsPullRequest
): Promise<void> {
  await electronApp.evaluate(
    (_electron, { fake, filesGlobal }) => {
      const scope: Record<string, unknown> = globalThis
      scope[filesGlobal] = { ...fake.files }
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
        if (apiPath.endsWith('/_apis/connectiondata')) {
          return json({ authenticatedUser: { id: 'me-guid-1', providerDisplayName: 'Me Example' } })
        }
        if (apiPath.endsWith('/_apis/git/repositories/app')) {
          return json({ id: fake.repositoryId })
        }
        if (apiPath.endsWith(pullRequestPath)) {
          return json({
            pullRequestId: fake.pullRequestId,
            title: fake.title,
            description: '',
            status: 'active',
            isDraft: false,
            creationDate: '2026-11-17T09:00:00Z',
            sourceRefName: 'refs/heads/feature/example',
            targetRefName: 'refs/heads/main',
            createdBy: { id: 'ada-guid', displayName: 'Ada Example' },
            reviewers: [{ id: 'me-guid-1', vote: 0 }]
          })
        }
        if (apiPath.endsWith(`${pullRequestPath}/iterations`)) {
          return json({
            value: [
              {
                id: 1,
                sourceRefCommit: { commitId: fake.sourceCommit },
                commonRefCommit: { commitId: fake.baseCommit },
                targetRefCommit: { commitId: fake.baseCommit }
              }
            ]
          })
        }
        if (apiPath.endsWith(`${pullRequestPath}/iterations/1/changes`)) {
          return json({ changeEntries: fake.changes })
        }
        if (apiPath.endsWith(`${pullRequestPath}/threads`)) {
          return json({ value: [] })
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
    { fake: pullRequest, filesGlobal: FILES_GLOBAL }
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
