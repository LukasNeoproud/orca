import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcess } from '@orca/process-host'
import { spawnBacklogProcess } from '../backlog-runtime/backlog-process'
import { createBacklogService, type BacklogTarget } from './backlog-service'
import type { BacklogSnapshot } from '../../shared/backlog-types'

// Opt in: uses an installed backlog.md CLI, and writes only isolated temporary projects.
describe.skipIf(process.env.ORCA_BACKLOG_INTEGRATION_TEST !== '1')(
  'installed Backlog.md CLI',
  () => {
    it('publishes configured priorities and task ordinal from an isolated project', async () => {
      const root = await mkdtemp(join(tmpdir(), 'orca-backlog-metadata-'))
      const service = createBacklogService()
      let release: (() => void) | undefined
      const command = async (args: string[]) => {
        const result = await runProcess({
          program: 'backlog',
          args,
          cwd: root,
          env: { ...process.env, BACKLOG_CWD: root },
          timeoutMs: 15_000
        })
        if (result.code !== 0) {
          throw new Error(result.stderr || result.stdout)
        }
      }
      try {
        await command([
          'init',
          'Metadata fixture',
          '--no-git',
          '--defaults',
          '--integration-mode',
          'none'
        ])
        await appendFile(
          join(root, 'backlog', 'config.yml'),
          '\npriorities: ["Urgent", "Normal", "Later"]\n'
        )
        await command([
          'task',
          'create',
          'Ordered task',
          '--priority',
          'Urgent',
          '--ordinal',
          '7',
          '--plain'
        ])
        const target: BacklogTarget = {
          key: root,
          spawn: (args) => spawnBacklogProcess({ kind: 'native', cwd: root }, args)
        }
        const snapshot = await new Promise<BacklogSnapshot>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Metadata snapshot timeout')), 12_000)
          release = service.subscribe(target, (value) => {
            if (value.state === 'error') {
              clearTimeout(timer)
              reject(new Error(value.error))
            } else if (value.state === 'ready' && value.priorities) {
              clearTimeout(timer)
              resolve(value)
            }
          })
        })
        expect(snapshot.priorities).toEqual(['Urgent', 'Normal', 'Later'])
        expect(snapshot.tasks).toMatchObject([
          { title: 'Ordered task', priority: 'urgent', ordinal: 7 }
        ])
      } finally {
        release?.()
        await service.dispose()
        await rm(root, { recursive: true, force: true })
      }
    }, 30_000)

    it('isolates projects, observes CLI edits, and serves the shared board', async () => {
      const roots = await Promise.all([
        mkdtemp(join(tmpdir(), 'orca-backlog-a-')),
        mkdtemp(join(tmpdir(), 'orca-backlog-b-'))
      ])
      const service = createBacklogService()
      const releases: (() => void)[] = []
      const command = async (cwd: string, args: string[]) => {
        const result = await runProcess({
          program: 'backlog',
          args,
          cwd,
          env: { ...process.env, BACKLOG_CWD: cwd },
          timeoutMs: 15_000
        })
        if (result.code !== 0) {
          throw new Error(result.stderr || result.stdout)
        }
        return result.stdout
      }
      const target = (cwd: string): BacklogTarget => ({
        key: cwd,
        spawn: (args) => spawnBacklogProcess({ kind: 'native', cwd }, args)
      })
      try {
        for (const [index, root] of roots.entries()) {
          await command(root, [
            'init',
            `Fixture ${index}`,
            '--no-git',
            '--defaults',
            '--integration-mode',
            'none'
          ])
          await command(root, ['task', 'create', `Only in project ${index}`, '--plain'])
        }
        const waitSnapshot = (scope: BacklogTarget, matches: (value: BacklogSnapshot) => boolean) =>
          new Promise<BacklogSnapshot>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Snapshot timeout')), 12_000)
            const release = service.subscribe(scope, (snapshot) => {
              if (snapshot.state === 'error') {
                clearTimeout(timer)
                reject(new Error(snapshot.error))
              } else if (matches(snapshot)) {
                clearTimeout(timer)
                resolve(snapshot)
              }
            })
            releases.push(release)
          })
        const [a, b] = await Promise.all(
          roots.map((root) => waitSnapshot(target(root), (snapshot) => snapshot.state === 'ready'))
        )
        expect(a.tasks.map((task) => task.title)).toEqual(['Only in project 0'])
        expect(b.tasks.map((task) => task.title)).toEqual(['Only in project 1'])
        const scope = target(roots[0])
        const changed = waitSnapshot(
          scope,
          (snapshot) => snapshot.tasks[0]?.status === 'In Progress'
        )
        await command(roots[0], ['task', 'edit', a.tasks[0].id, '--status', 'In Progress'])
        await changed
        expect((await service.getTaskDetail(scope, a.tasks[0].id)).status).toBe('In Progress')
        const [board, duplicate] = await Promise.all([
          service.acquireBoard(scope, 'tab-a'),
          service.acquireBoard(scope, 'tab-b')
        ])
        expect(board).toEqual(duplicate)
        const response = await fetch(board.url, { signal: AbortSignal.timeout(10_000) })
        expect(response.ok).toBe(true)
        expect(await response.text()).toContain('<html')
      } finally {
        releases.forEach((release) => release())
        await service.dispose()
        await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
      }
    }, 60_000)
  }
)
