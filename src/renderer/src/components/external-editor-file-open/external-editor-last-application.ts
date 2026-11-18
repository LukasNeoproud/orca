const STORAGE_KEY = 'orca.openInExternalEditor.lastApplicationByRepo'

function readChoices(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const choices: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        choices[key] = value
      }
    }
    return choices
  } catch {
    return {}
  }
}

/** Id of the application last used to open a file of this repository or folder workspace. */
export function readLastExternalEditorApplicationId(preferenceKey: string): string | null {
  return readChoices()[preferenceKey] ?? null
}

export function rememberExternalEditorApplication(
  preferenceKey: string,
  applicationId: string
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readChoices(), [preferenceKey]: applicationId })
    )
  } catch {
    // Only a remembered default; the first available application still opens the file.
  }
}
