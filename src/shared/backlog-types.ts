export const BACKLOG_RUNTIME_CAPABILITY = 'backlog.v1'

export type BacklogTask = {
  id: string
  title: string
  status: string
  priority: string | null
  ordinal?: number
  description?: string
  acceptanceCriteria?: { index: number; text: string; checked: boolean }[]
}

export type BacklogSnapshot = {
  state: 'loading' | 'ready' | 'error'
  tasks: BacklogTask[]
  priorities?: string[]
  error?: string
  stale?: boolean
}

export type BacklogBoard = {
  url: string
  port: number
  instanceId: string
}
