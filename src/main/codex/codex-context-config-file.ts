import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  parseTomlSingleLineStringValue,
  updateTomlLineScanState
} from './config-toml-line-scan'
import { parseTomlKeyPath, parseTomlTableHeaderPath } from './config-toml-key-path'
import type { CodexContextConfig } from './codex-context-usage'

export function readConfiguredCodexModelCatalogPath(
  source: string,
  profile: string | null
): string | null {
  return readCodexContextConfigFile(source, profile).modelCatalogPath ?? null
}

export function readCodexContextConfigFile(
  source: string,
  profile: string | null
): CodexContextConfig {
  let tablePath: string[] = []
  let state = createTomlLineScanState()
  const root: CodexContextConfig = {}
  const selected: CodexContextConfig = {}
  for (const line of source.split('\n')) {
    if (isTomlStructuralLine(state)) {
      const header = getTomlTableHeader(line)
      if (header) {
        tablePath = parseTomlTableHeaderPath(header)?.segments ?? []
      } else {
        readConfigLine(line, tablePath, profile, root, selected)
      }
    }
    state = updateTomlLineScanState(state, line)
  }
  return { ...root, ...selected }
}

function readConfigLine(
  line: string,
  tablePath: readonly string[],
  profile: string | null,
  root: CodexContextConfig,
  selected: CodexContextConfig
): void {
  const key = parseTomlKeyPath(line)
  const target =
    tablePath.length === 0
      ? root
      : profile && tablePath.length === 2 && tablePath[0] === 'profiles' && tablePath[1] === profile
        ? selected
        : null
  const name = key?.segments.length === 1 ? key.segments[0] : null
  const equals = key ? line.indexOf('=', key.end) : -1
  if (!target || !name || equals === -1) {
    return
  }
  const raw = line.slice(equals + 1).trim()
  const stringValue = parseTomlSingleLineStringValue(line, equals + 1)?.value.trim()
  const integerValue = /^\d(?:_?\d)*$/.test(raw)
    ? Number.parseInt(raw.replaceAll('_', ''), 10)
    : undefined
  if (name === 'model' && stringValue) {
    target.model = stringValue
  } else if (name === 'model_catalog_json' && stringValue) {
    target.modelCatalogPath = stringValue
  } else if (name === 'model_context_window' && positiveInteger(integerValue)) {
    target.rawContextWindow = integerValue
  } else if (name === 'model_auto_compact_token_limit' && positiveInteger(integerValue)) {
    target.autoCompactThreshold = integerValue
  } else if (
    name === 'model_auto_compact_token_limit_scope' &&
    (stringValue === 'total' || stringValue === 'body_after_prefix')
  ) {
    target.compactScope = stringValue
  }
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}
