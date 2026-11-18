import { beforeEach, describe, expect, it } from 'vitest'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { resolveGitAnnotateFileContext } from './git-annotate-file-context'

const WORKTREE_ID = 'repo-1::/tmp/bakery'

function openFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/tmp/bakery/kitchen/bread.ts',
    filePath: '/tmp/bakery/kitchen/bread.ts',
    relativePath: 'kitchen/bread.ts',
    worktreeId: WORKTREE_ID,
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

function resolve(file: OpenFile): ReturnType<typeof resolveGitAnnotateFileContext> {
  useAppStore.setState({ openFiles: [file] })
  return resolveGitAnnotateFileContext(useAppStore.getState(), file.id)
}

describe('resolveGitAnnotateFileContext', () => {
  beforeEach(() => {
    useAppStore.setState({
      repos: [makeRepo()],
      worktreesByRepo: {
        'repo-1': [makeWorktree(WORKTREE_ID, 'bakery', { path: '/tmp/bakery' })]
      }
    })
  })

  it('annotates a file of a local git worktree on this machine', () => {
    expect(resolve(openFile())).toMatchObject({
      worktreeId: WORKTREE_ID,
      relativePath: 'kitchen/bread.ts',
      hostKey: 'local',
      remoteHost: false,
      gitContext: { target: { kind: 'local' }, worktreePath: '/tmp/bakery' }
    })
  })

  it('asks the remote host that owns the file, which can be an older Orca', () => {
    expect(resolve(openFile({ runtimeEnvironmentId: 'env-ssh' }))).toMatchObject({
      hostKey: 'env:env-ssh',
      remoteHost: true,
      gitContext: { target: { kind: 'environment', environmentId: 'env-ssh' } }
    })
  })

  it('offers nothing in a folder workspace, which has no git', () => {
    expect(resolve(openFile({ worktreeId: 'folder:notes' }))).toBeNull()

    useAppStore.setState({ repos: [{ ...makeRepo(), kind: 'folder' }] })
    expect(resolve(openFile())).toBeNull()
  })

  it('offers nothing for a diff tab or a file outside the worktree', () => {
    expect(resolve(openFile({ mode: 'diff' }))).toBeNull()
    expect(resolve(openFile({ relativePath: '../elsewhere.ts' }))).toBeNull()
    expect(resolve(openFile({ relativePath: '/etc/hosts' }))).toBeNull()
    expect(resolve(openFile({ externalSshTargetId: 'ssh-1' }))).toBeNull()
  })

  it('offers nothing for a worktree the app does not know', () => {
    expect(resolve(openFile({ worktreeId: 'repo-1::/tmp/gone' }))).toBeNull()
  })
})
