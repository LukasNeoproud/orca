import AsyncStorage from '@react-native-async-storage/async-storage'
import { persistMirrored } from '../storage/mirrored-storage-keys'

import { TERMINAL_ACCESSORY_KEYS, type TerminalAccessoryKey } from './terminal-accessory-keys'

export const TERMINAL_ACCESSORY_LAYOUT_STORAGE_KEY = 'orca:terminal-accessory-layout'

export type TerminalAccessoryLayout = {
  rows: string[][]
  visibleBuiltInIds: string[]
}

export type TerminalAccessoryLayoutPreference = TerminalAccessoryLayout & {
  version: 3
}

function builtInIds(): string[] {
  return TERMINAL_ACCESSORY_KEYS.map((key) => key.id)
}

function defaultPreference(ids = builtInIds()): TerminalAccessoryLayoutPreference {
  return { version: 3, rows: [[...ids]], visibleBuiltInIds: [...ids] }
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  return value.every((item): item is string => typeof item === 'string') ? value : null
}

function dedupeKnownIds(ids: string[], knownSet: Set<string>): string[] {
  const seen = new Set<string>()
  return ids.filter((id) => {
    if (!knownSet.has(id) || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

function normalizeRows(
  rawRows: string[][],
  currentBuiltInIds: string[],
  customKeyIds: string[]
): { rows: string[][]; insertedBuiltInIds: string[] } {
  const builtInSet = new Set(currentBuiltInIds)
  const customIds = dedupeKnownIds(customKeyIds, new Set(customKeyIds)).filter(
    (id) => !builtInSet.has(id)
  )
  const known = new Set([...currentBuiltInIds, ...customIds])
  const seen = new Set<string>()
  const rows = rawRows.slice(0, 3).map((row) =>
    row.filter((id) => {
      if (!known.has(id) || seen.has(id)) {
        return false
      }
      seen.add(id)
      return true
    })
  )
  if (rows.length === 0) {
    rows.push([])
  }

  const insertedBuiltInIds: string[] = []
  for (let i = 0; i < currentBuiltInIds.length; i++) {
    const id = currentBuiltInIds[i]!
    if (seen.has(id)) {
      continue
    }
    let targetRow = 0
    let targetIndex = 0
    for (let j = i - 1; j >= 0; j--) {
      const predecessor = currentBuiltInIds[j]!
      const rowIndex = rows.findIndex((row) => row.includes(predecessor))
      if (rowIndex !== -1) {
        targetRow = rowIndex
        targetIndex = rows[rowIndex]!.indexOf(predecessor) + 1
        break
      }
    }
    rows[targetRow]!.splice(targetIndex, 0, id)
    seen.add(id)
    insertedBuiltInIds.push(id)
  }
  for (const id of customIds) {
    if (!seen.has(id)) {
      rows[0]!.push(id)
    }
  }
  return { rows, insertedBuiltInIds }
}

function preferenceFromRows(
  rows: string[][],
  visibleBuiltInIds: string[],
  currentBuiltInIds: string[],
  customKeyIds: string[],
  newlyVisibleBuiltInIds: string[] = []
): TerminalAccessoryLayoutPreference {
  const { rows: normalizedRows, insertedBuiltInIds } = normalizeRows(
    rows,
    currentBuiltInIds,
    customKeyIds
  )
  const visible = new Set([
    ...dedupeKnownIds(visibleBuiltInIds, new Set(currentBuiltInIds)),
    ...newlyVisibleBuiltInIds,
    ...insertedBuiltInIds
  ])
  return {
    version: 3,
    rows: normalizedRows,
    visibleBuiltInIds: normalizedRows.flat().filter((id) => visible.has(id))
  }
}

export function getDefaultTerminalAccessoryBuiltInIds(): string[] {
  return builtInIds()
}

export function getDefaultTerminalAccessoryLayout(): TerminalAccessoryLayout {
  const { rows, visibleBuiltInIds } = defaultPreference()
  return { rows, visibleBuiltInIds }
}

export function normalizeTerminalAccessoryLayoutPreference(
  value: unknown,
  currentBuiltInIds = builtInIds(),
  customKeyIds: string[] = []
): TerminalAccessoryLayoutPreference {
  const fallback = defaultPreference(currentBuiltInIds)
  if (!value || typeof value !== 'object') {
    return preferenceFromRows(
      fallback.rows,
      fallback.visibleBuiltInIds,
      currentBuiltInIds,
      customKeyIds
    )
  }
  const candidate = value as {
    version?: unknown
    rows?: unknown
    orderedBuiltInIds?: unknown
    visibleBuiltInIds?: unknown
    knownBuiltInIds?: unknown
  }
  const visibleInput = stringArray(candidate.visibleBuiltInIds)
  if (!visibleInput) {
    return preferenceFromRows(
      fallback.rows,
      fallback.visibleBuiltInIds,
      currentBuiltInIds,
      customKeyIds
    )
  }
  if (candidate.version === 3) {
    const rows = Array.isArray(candidate.rows) ? candidate.rows.map(stringArray) : null
    if (!rows || rows.length < 1 || rows.length > 3 || rows.some((row) => row === null)) {
      return preferenceFromRows(
        fallback.rows,
        fallback.visibleBuiltInIds,
        currentBuiltInIds,
        customKeyIds
      )
    }
    return preferenceFromRows(rows as string[][], visibleInput, currentBuiltInIds, customKeyIds)
  }
  if (candidate.version === 2) {
    const orderedInput = stringArray(candidate.orderedBuiltInIds)
    if (!orderedInput) {
      return preferenceFromRows(
        fallback.rows,
        fallback.visibleBuiltInIds,
        currentBuiltInIds,
        customKeyIds
      )
    }
    return preferenceFromRows([orderedInput], visibleInput, currentBuiltInIds, customKeyIds)
  }
  if (candidate.version === 1) {
    const knownInput = stringArray(candidate.knownBuiltInIds)
    if (!knownInput) {
      return preferenceFromRows(
        fallback.rows,
        fallback.visibleBuiltInIds,
        currentBuiltInIds,
        customKeyIds
      )
    }
    const known = new Set(knownInput)
    return preferenceFromRows(
      [[...currentBuiltInIds]],
      visibleInput,
      currentBuiltInIds,
      customKeyIds,
      currentBuiltInIds.filter((id) => !known.has(id))
    )
  }
  return preferenceFromRows(
    fallback.rows,
    fallback.visibleBuiltInIds,
    currentBuiltInIds,
    customKeyIds
  )
}

export function createTerminalAccessoryLayoutPreference(
  layout: TerminalAccessoryLayout,
  currentBuiltInIds = builtInIds(),
  customKeyIds: string[] = []
): TerminalAccessoryLayoutPreference {
  return preferenceFromRows(layout.rows, layout.visibleBuiltInIds, currentBuiltInIds, customKeyIds)
}

export function setTerminalAccessoryBuiltInVisible(
  layout: TerminalAccessoryLayout,
  id: string,
  visible: boolean,
  currentBuiltInIds = builtInIds(),
  customKeyIds: string[] = []
): TerminalAccessoryLayout {
  const preference = createTerminalAccessoryLayoutPreference(
    layout,
    currentBuiltInIds,
    customKeyIds
  )
  if (!currentBuiltInIds.includes(id)) {
    return { rows: preference.rows, visibleBuiltInIds: preference.visibleBuiltInIds }
  }
  const visibleSet = new Set(preference.visibleBuiltInIds)
  if (visible) {
    visibleSet.add(id)
  } else {
    visibleSet.delete(id)
  }
  return {
    rows: preference.rows,
    visibleBuiltInIds: preference.rows.flat().filter((keyId) => visibleSet.has(keyId))
  }
}

export function setTerminalAccessoryRowCount(
  layout: TerminalAccessoryLayout,
  rowCount: 1 | 2 | 3,
  currentBuiltInIds = builtInIds(),
  customKeyIds: string[] = []
): TerminalAccessoryLayout {
  const current = createTerminalAccessoryLayoutPreference(layout, currentBuiltInIds, customKeyIds)
  const rows = current.rows.map((row) => [...row])
  if (rowCount < rows.length) {
    const removed = rows.splice(rowCount).flat()
    rows[rowCount - 1]!.push(...removed)
  } else {
    while (rows.length < rowCount) {
      rows.push([])
    }
  }
  return { rows, visibleBuiltInIds: current.visibleBuiltInIds }
}

export function moveTerminalAccessoryKey(
  layout: TerminalAccessoryLayout,
  id: string,
  targetRow: number,
  targetIndex: number,
  currentBuiltInIds = builtInIds(),
  customKeyIds: string[] = []
): TerminalAccessoryLayout {
  const current = createTerminalAccessoryLayoutPreference(layout, currentBuiltInIds, customKeyIds)
  if (targetRow < 0 || targetRow >= current.rows.length || !current.rows.flat().includes(id)) {
    return { rows: current.rows, visibleBuiltInIds: current.visibleBuiltInIds }
  }
  const rows = current.rows.map((row) => row.filter((keyId) => keyId !== id))
  const index = Math.max(0, Math.min(targetIndex, rows[targetRow]!.length))
  rows[targetRow]!.splice(index, 0, id)
  return { rows, visibleBuiltInIds: current.visibleBuiltInIds }
}

export function getVisibleTerminalAccessoryRows(
  layout: TerminalAccessoryLayout,
  customKeyIds: string[] = []
): string[][] {
  const visible = new Set(layout.visibleBuiltInIds)
  const custom = new Set(customKeyIds)
  return layout.rows.map((row) => row.filter((id) => visible.has(id) || custom.has(id)))
}

export function getVisibleTerminalAccessoryKeys(
  visibleBuiltInIds: string[]
): TerminalAccessoryKey[] {
  const byId = new Map(TERMINAL_ACCESSORY_KEYS.map((key) => [key.id, key]))
  return dedupeKnownIds(visibleBuiltInIds, new Set(byId.keys())).flatMap((id) => {
    const key = byId.get(id)
    return key ? [key] : []
  })
}

export async function loadTerminalAccessoryLayout(
  customKeyIds: string[] = []
): Promise<TerminalAccessoryLayoutPreference> {
  try {
    const raw = await AsyncStorage.getItem(TERMINAL_ACCESSORY_LAYOUT_STORAGE_KEY)
    return normalizeTerminalAccessoryLayoutPreference(
      raw ? JSON.parse(raw) : null,
      builtInIds(),
      customKeyIds
    )
  } catch {
    return normalizeTerminalAccessoryLayoutPreference(null, builtInIds(), customKeyIds)
  }
}

export async function saveTerminalAccessoryLayout(
  layout: TerminalAccessoryLayout,
  customKeyIds: string[] = []
): Promise<void> {
  const preference = createTerminalAccessoryLayoutPreference(layout, builtInIds(), customKeyIds)
  // Through the one write path: the hybrid shell hands this key to the page on every `init`,
  // built synchronously, and what it reads is noted there on an accepted write (ruling 35).
  await persistMirrored(TERMINAL_ACCESSORY_LAYOUT_STORAGE_KEY, JSON.stringify(preference))
}
