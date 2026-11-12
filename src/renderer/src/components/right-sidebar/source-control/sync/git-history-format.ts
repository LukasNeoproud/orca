// Why: the zone name disambiguates the repeated hour when clocks fall back.
const gitHistoryTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'long'
})

export function formatGitHistoryTimestamp(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return gitHistoryTimestampFormatter.format(date)
}

const gitGraphTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
})

/** Column-width date for the graph window; the full form stays in the commit details. */
export function formatGitGraphTimestamp(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '' : gitGraphTimestampFormatter.format(date)
}
