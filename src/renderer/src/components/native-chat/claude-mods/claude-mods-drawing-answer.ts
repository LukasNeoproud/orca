import { readClaudeModsClientModules, readClaudeModsTree } from './claude-mods-tree'
import type { ClaudeModsDrawing } from './claude-mods-surface-types'

/** A `ui_render` answer as a drawing; `hooked` is read by the caller, which also acts on it. */
export function readClaudeModsDrawing(
  answer: Record<string, unknown>,
  hooked: boolean
): ClaudeModsDrawing {
  const drawnBy = Array.isArray(answer.drawn_by)
    ? answer.drawn_by.filter((name): name is string => typeof name === 'string')
    : []
  const clientModules = readClaudeModsClientModules(answer.client_modules)
  const drawing = { tree: readClaudeModsTree(answer.tree), hooked, drawnBy }
  return clientModules ? { ...drawing, clientModules } : drawing
}
