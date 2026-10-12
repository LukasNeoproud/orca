import { runProcess } from '@orca/process-host'

const MAX_PARENT_HOPS = 24

async function readParentPid(pid: number): Promise<number | null> {
  const result = await runProcess({
    program: '/bin/ps',
    args: ['-p', String(pid), '-o', 'ppid='],
    timeoutMs: 500,
    maxOutputBytes: 64
  })
  const value = result.stdout.trim()
  return result.code === 0 && !result.timedOut && /^\d+$/.test(value) ? Number(value) : null
}

export async function isRequesterDescendantOfMobileTerminal(
  requesterPid: number,
  rootPids: readonly number[],
  parentPid: (pid: number) => Promise<number | null> = readParentPid
): Promise<boolean> {
  if (!Number.isSafeInteger(requesterPid) || requesterPid <= 0 || rootPids.length === 0) {
    return false
  }
  const roots = new Set(rootPids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))
  const seen = new Set<number>()
  let pid = requesterPid
  for (let hop = 0; hop < MAX_PARENT_HOPS && pid > 1 && !seen.has(pid); hop++) {
    if (roots.has(pid)) {
      return true
    }
    seen.add(pid)
    try {
      pid = (await parentPid(pid)) ?? 0
    } catch {
      return false
    }
  }
  return false
}
