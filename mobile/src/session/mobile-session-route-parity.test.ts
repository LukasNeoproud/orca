import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript-api'
import { describe, expect, it } from 'vitest'
import { MOBILE_SESSION_ROUTE_SOURCE_FILES } from './mobile-session-route-source-family.test-support'

const SESSION_FILES = MOBILE_SESSION_ROUTE_SOURCE_FILES
const LOGIC_EXPANSION_NAMES = new Set([
  'useMobileSessionController',
  'useMobileSessionFoundation',
  'useMobileSessionScreenState',
  'useMobileSessionTerminalRuntime',
  'useMobileSessionFeedbackCapabilities',
  'useMobileSessionNativeChatDictation',
  'useMobileSessionTerminalSubscriptionFoundation',
  'useMobileSessionTerminalSubscription',
  'useMobileSessionTerminalStreamDisplay',
  'useMobileSessionTerminalList',
  'useMobileSessionTabApplication',
  'useMobileSessionDocumentReaders',
  'useMobileSessionDiffComments',
  'useMobileSessionMarkdownActions',
  'useMobileSessionTabReconciliation',
  'useMobileSessionLifecycle',
  'useMobileSessionKeyboardState',
  'useMobileSessionStartup',
  'useMobileSessionPreferenceFocus',
  'useMobileSessionTabSwitching',
  'useMobileSessionEmulatorTabs',
  'useMobileSessionTerminalWebview',
  'useMobileSessionTerminalSendActions',
  'useMobileSessionFileActions',
  'useMobileSessionTerminalInput',
  'useMobileSessionAccessorySelection',
  'useMobileSessionAttachments',
  'useMobileSessionTerminalCreateActions',
  'useMobileSessionContentCreateActions',
  'useMobileSessionCloseActions',
  'useMobileSessionBulkClose',
  'useMobileSessionPresentation',
  'useMobileSessionPanelRouteActions'
])
const SURFACE_EXPANSION_NAMES = new Set([
  'MobileSessionSurface',
  'MobileSessionHeader',
  'MobileSessionContentRow',
  'MobileSessionActiveContent',
  'MobileSessionCommandDock',
  'MobileTerminalAccessoryRows',
  'MobileSessionSheets',
  'MobileSessionEmulatorSheets'
])
const CONTENT_COMPONENT_NAMES = ['MarkdownReader', 'DiffLineRow', 'FileReader'] as const
const HOST_COMPONENT_NAMES = new Set([
  'ActivityIndicator',
  'Animated.View',
  'FlatList',
  'Image',
  'Pressable',
  'SafeAreaView',
  'ScrollView',
  'Text',
  'TextInput',
  'View'
])

const HEAD_MAIN_HOOK_SHA256 = '3eb66d6b94c74738209d1055bf69fae055415954a7d667a76ca54198fd3b5f54'
const HEAD_HOOK_BINDING_SHA256 = 'a26472fa27bb9e372f1610aebf38b7e526650f3f2159731b6b5527b2f1caf198'
const HEAD_CALLBACK_IDENTITY_SHA256 =
  'd344314fd3e52ffb05139cd753e785a1ee4262b52aec66413d613ca46bab3623'
const HEAD_CALLBACK_BODY_SHA256 = '521d0564bf6a937298fd66dd01e3fdc80d6471c59acf8bdfb50e930260df7ba6'
const HEAD_EFFECT_SHA256 = '125d330b3e87dcf3604ffcf88fff09d7525fafc4a6771a21ded8b670ca4d3c44'
const HEAD_CONTENT_HOOK_SHA256 = '9c3b612fef3f370d66873aefdbe1d701f20cb64ded31fef5cc45fde6f8189581'
const HEAD_NESTED_FUNCTION_SHA256 =
  'e6174a40fb3b47798a6014f94dca49a4f49b8edaf3d714b3b28c65feccfc83bf'
const HEAD_NATIVE_REGISTRATION_SHA256 =
  '98412982126f256f659e68cc0d6aa523b74a2d9c2eab4ea00df93c4b9bed88db'
const HEAD_NATIVE_REMOVAL_SHA256 =
  '27007f82bc833005d9e05ad107b486527c78e8bca5274e8c128014a0fa9b63ec'
const HEAD_TIMER_CREATION_SHA256 =
  '1a31b625e2174c3db77272249843196d2b6b06ab1e654a96d8f7858e3082e66b'
const HEAD_TIMER_CLEANUP_SHA256 = 'c73f1d1c2cc89642f3d727d6f3b6b81860a9d6f34234541a2065ec3d1a8cd116'
const HEAD_RUNTIME_STRING_SHA256 =
  '86cef5e980f8e1cd0a0073f38cba938a309e8d14eb08bc9abe7c845f8ed18233'
const HEAD_HOST_JSX_SHA256 = '8b99f5804775b30a27a0b82f873e7ded2a8228738b6fdb6058ecd9b7f08f94ed'
const HEAD_LEAF_JSX_SHA256 = '9a1f2251d8457acb8e5a7791509b3c9cd3b8705abbc31b8bf877cc25958bf6e6'
const HEAD_STYLE_REFERENCE_SHA256 =
  '64318bc42b7e329d6767bd5e0076ce18a525f60e8d40ee810b8e30895d40a2be'
const HEAD_IDENTITY_FIELD_SHA256 =
  '91146853930a34dd1f3d80e5c97fbacd7cf19fb93dd26fe8fc6f29169622f9d6'
const HEAD_NAVIGATION_SHA256 = '5bd9eb0d6cbe22fda81ff4567113255ea64a738ee016945de5d768565e4e8c18'
const HEAD_CAPABILITY_SHA256 = 'b43db9cbdd446c2d0edef96295f7f61f75fcf4af85d8adac35771994705fc3c0'

type Definition = { declaration: ts.FunctionDeclaration; sourceFile: ts.SourceFile }
type HookFacts = {
  bindings: string[]
  callbackBodies: string[]
  callbacks: string[]
  effects: string[]
  hooks: string[]
}

const printer = ts.createPrinter({ removeComments: true })
const sourceFiles = new Map<string, ts.SourceFile>()

function parse(relativePath: string): ts.SourceFile {
  const cached = sourceFiles.get(relativePath)
  if (cached) {
    return cached
  }
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url))
  const sourceFile = ts.createSourceFile(
    relativePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  sourceFiles.set(relativePath, sourceFile)
  return sourceFile
}

function canonical(node: ts.Node, sourceFile: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile).replace(/\s+/g, '')
}

function hash(values: readonly string[]): string {
  return createHash('sha256').update(values.join('\n')).digest('hex')
}

function readDefinitions(): Map<string, Definition> {
  const definitions = new Map<string, Definition>()
  for (const relativePath of SESSION_FILES) {
    const sourceFile = parse(relativePath)
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        definitions.set(node.name.text, { declaration: node, sourceFile })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return definitions
}

function visitLogicalFunction(
  name: string,
  definitions: ReadonlyMap<string, Definition>,
  onNode: (node: ts.Node, sourceFile: ts.SourceFile) => void,
  active = new Set<string>()
): void {
  const definition = definitions.get(name)
  if (!definition?.declaration.body) {
    throw new Error(`Missing session function: ${name}`)
  }
  if (active.has(name)) {
    throw new Error(`Recursive session function: ${name}`)
  }
  const nextActive = new Set(active).add(name)
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      LOGIC_EXPANSION_NAMES.has(node.expression.text)
    ) {
      visitLogicalFunction(node.expression.text, definitions, onNode, nextActive)
      return
    }
    onNode(node, definition.sourceFile)
    ts.forEachChild(node, visit)
  }
  visit(definition.declaration.body)
}

function readHookFacts(name: string, definitions: ReadonlyMap<string, Definition>): HookFacts {
  const facts: HookFacts = {
    bindings: [],
    callbackBodies: [],
    callbacks: [],
    effects: [],
    hooks: []
  }
  visitLogicalFunction(name, definitions, (node, sourceFile) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      !/^use[A-Z]/.test(node.expression.text)
    ) {
      return
    }
    const hookName = node.expression.text
    facts.hooks.push(hookName)
    const owner = ts.isVariableDeclaration(node.parent)
      ? node.parent.name.getText(sourceFile)
      : ts.isExpressionStatement(node.parent)
        ? '<statement>'
        : ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression)
          ? `<argument:${node.parent.expression.text}>`
          : '<nested>'
    const lastArgument = node.arguments.at(-1)
    const dependencies =
      lastArgument && ts.isArrayLiteralExpression(lastArgument)
        ? canonical(lastArgument, sourceFile)
        : '<none>'
    facts.bindings.push(`${hookName}|${owner}|${dependencies}`)
    if (hookName === 'useCallback') {
      facts.callbacks.push(`${owner}|${dependencies}`)
      facts.callbackBodies.push(
        `${owner}|${canonical(node.arguments[0], sourceFile)}|${dependencies}`
      )
    }
    if (hookName === 'useEffect') {
      facts.effects.push(`${canonical(node.arguments[0], sourceFile)}|${dependencies}`)
    }
  })
  return facts
}

function readNestedFunctions(definitions: ReadonlyMap<string, Definition>): string[] {
  const functions: string[] = []
  const visitDefinition = (name: string, active: ReadonlySet<string>): void => {
    const definition = definitions.get(name)
    if (!definition?.declaration.body || active.has(name)) {
      throw new Error(`Invalid nested-function stage: ${name}`)
    }
    const nextActive = new Set(active).add(name)
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        LOGIC_EXPANSION_NAMES.has(node.expression.text)
      ) {
        visitDefinition(node.expression.text, nextActive)
        return
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        functions.push(`${node.name.text}|${canonical(node, definition.sourceFile)}`)
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(definition.declaration.body)
  }
  visitDefinition('SessionScreen', new Set())
  return functions
}

function readNativeAndTimerFacts(definitions: ReadonlyMap<string, Definition>): {
  cleanups: string[]
  creations: string[]
  registrations: string[]
  removals: string[]
} {
  const registrations: string[] = []
  const removals: string[] = []
  const creations: string[] = []
  const cleanups: string[] = []
  const collect = (node: ts.Node, sourceFile: ts.SourceFile): void => {
    if (!ts.isCallExpression(node)) {
      return
    }
    if (ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile)
      const method = node.expression.name.text
      if (
        ['BackHandler', 'AppState', 'Keyboard'].includes(receiver) &&
        ['addEventListener', 'addListener'].includes(method)
      ) {
        registrations.push(canonical(node, sourceFile))
      }
      if (method === 'remove') {
        removals.push(canonical(node, sourceFile))
      }
    }
    if (ts.isIdentifier(node.expression)) {
      if (['setTimeout', 'setInterval', 'requestAnimationFrame'].includes(node.expression.text)) {
        creations.push(canonical(node, sourceFile))
      }
      if (
        ['clearTimeout', 'clearInterval', 'cancelAnimationFrame'].includes(node.expression.text)
      ) {
        cleanups.push(canonical(node, sourceFile))
      }
    }
  }
  visitLogicalFunction('FileReader', definitions, collect)
  visitLogicalFunction('SessionScreen', definitions, collect)
  return { cleanups, creations, registrations, removals }
}

function isRuntimeNode(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isImportTypeNode(parent) ||
      ts.isTypeNode(parent)
    ) {
      return false
    }
  }
  return true
}

function readRuntimeStrings(): string[] {
  const values: string[] = []
  for (const relativePath of SESSION_FILES) {
    const visit = (node: ts.Node): void => {
      if (isRuntimeNode(node)) {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        ) {
          values.push(node.text)
        }
        if (ts.isJsxText(node) && node.text.trim()) {
          values.push(node.text.replace(/\s+/g, ' ').trim())
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(parse(relativePath))
  }
  return values.sort()
}

function readJsxFacts(definitions: ReadonlyMap<string, Definition>): {
  host: string[]
  leaf: string[]
  styleReferences: string[]
} {
  const host: string[] = []
  const leaf: string[] = []
  const active = new Set<string>()
  const visitDefinition = (name: string): void => {
    const definition = definitions.get(name)
    if (!definition?.declaration.body || active.has(name)) {
      throw new Error(`Invalid JSX stage: ${name}`)
    }
    active.add(name)
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        LOGIC_EXPANSION_NAMES.has(node.expression.text)
      ) {
        visitDefinition(node.expression.text)
        return
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node
        const tagName = opening.tagName.getText(definition.sourceFile)
        if (SURFACE_EXPANSION_NAMES.has(tagName)) {
          visitDefinition(tagName)
          return
        }
        const attributes = opening.attributes.properties
          .map((attribute) => {
            if (ts.isJsxSpreadAttribute(attribute)) {
              return `...${canonical(attribute.expression, definition.sourceFile)}`
            }
            const attributeName = attribute.name.getText(definition.sourceFile)
            if (!attribute.initializer) {
              return attributeName
            }
            if (ts.isStringLiteral(attribute.initializer)) {
              return `${attributeName}=${JSON.stringify(attribute.initializer.text)}`
            }
            return `${attributeName}=${
              attribute.initializer.expression
                ? canonical(attribute.initializer.expression, definition.sourceFile)
                : ''
            }`
          })
          .join(',')
        ;(HOST_COMPONENT_NAMES.has(tagName) ? host : leaf).push(`${tagName}|${attributes}`)
        for (const attribute of opening.attributes.properties) {
          ts.forEachChild(attribute, visit)
        }
        if (ts.isJsxElement(node)) {
          for (const child of node.children) {
            visit(child)
          }
        }
        return
      }
      if (ts.isJsxFragment(node)) {
        for (const child of node.children) {
          visit(child)
        }
        return
      }
      ts.forEachChild(node, visit)
    }
    visit(definition.declaration.body)
    active.delete(name)
  }
  for (const name of CONTENT_COMPONENT_NAMES) {
    visitDefinition(name)
  }
  visitDefinition('SessionScreen')
  const styleReferences: string[] = []
  for (const record of [...host, ...leaf]) {
    for (const match of record.matchAll(/styles\.([A-Za-z0-9_]+)/g)) {
      styleReferences.push(match[1])
    }
  }
  return { host, leaf, styleReferences }
}

function readCompatibilityFacts(definitions: ReadonlyMap<string, Definition>): {
  capabilities: string[]
  identityFields: string[]
  navigation: string[]
} {
  const capabilities: string[] = []
  const identityFields: string[] = []
  const navigation: string[] = []
  visitLogicalFunction('SessionScreen', definitions, (node, sourceFile) => {
    if (!isRuntimeNode(node)) {
      return
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sourceFile)
      if (['notifyClients', 'deviceToken', 'clientId'].includes(name)) {
        identityFields.push(`${name}|${canonical(node.initializer, sourceFile)}`)
      }
      if (
        name === 'client' &&
        ts.isObjectLiteralExpression(node.initializer) &&
        node.initializer.properties.some(
          (property) => property.name?.getText(sourceFile) === 'id'
        ) &&
        node.initializer.properties.some(
          (property) => property.name?.getText(sourceFile) === 'type'
        )
      ) {
        identityFields.push(`client|${canonical(node.initializer, sourceFile)}`)
      }
    }
    if (!ts.isCallExpression(node)) {
      return
    }
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'router' &&
      ['push', 'replace', 'back'].includes(node.expression.name.text)
    ) {
      navigation.push(canonical(node, sourceFile))
    }
    const callName = ts.isIdentifier(node.expression)
      ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ''
    const callText = canonical(node, sourceFile)
    if (
      ['startRuntimeCapabilityProbe', 'supportsMobileQuickCommands'].includes(callName) ||
      (callName === 'includes' && callText.includes('capabilities.includes'))
    ) {
      capabilities.push(callText)
    }
  })
  return { capabilities, identityFields, navigation }
}

describe('mobile session route extraction parity', () => {
  it('preserves hooks, callbacks, effects, and nested action bodies', () => {
    const definitions = readDefinitions()
    const main = readHookFacts('SessionScreen', definitions)
    const contentBindings = CONTENT_COMPONENT_NAMES.flatMap(
      (name) => readHookFacts(name, definitions).bindings
    )
    expect(main.hooks).toHaveLength(288)
    expect(hash(main.hooks)).toBe(HEAD_MAIN_HOOK_SHA256)
    expect(hash(main.bindings)).toBe(HEAD_HOOK_BINDING_SHA256)
    expect(main.callbacks).toHaveLength(90)
    expect(hash(main.callbacks)).toBe(HEAD_CALLBACK_IDENTITY_SHA256)
    expect(hash(main.callbackBodies)).toBe(HEAD_CALLBACK_BODY_SHA256)
    expect(main.effects).toHaveLength(25)
    expect(hash(main.effects)).toBe(HEAD_EFFECT_SHA256)
    expect(contentBindings).toHaveLength(14)
    expect(hash(contentBindings)).toBe(HEAD_CONTENT_HOOK_SHA256)
    const nestedFunctions = readNestedFunctions(definitions)
    expect(nestedFunctions).toHaveLength(12)
    expect(hash(nestedFunctions)).toBe(HEAD_NESTED_FUNCTION_SHA256)
  })

  it('preserves native listeners, timers, identity payloads, and compatibility gates', () => {
    const definitions = readDefinitions()
    const native = readNativeAndTimerFacts(definitions)
    expect(native.registrations).toHaveLength(8)
    expect(hash(native.registrations)).toBe(HEAD_NATIVE_REGISTRATION_SHA256)
    expect(native.removals).toHaveLength(10)
    expect(hash(native.removals)).toBe(HEAD_NATIVE_REMOVAL_SHA256)
    expect(native.creations.filter((fact) => fact.startsWith('setTimeout'))).toHaveLength(7)
    expect(native.creations.filter((fact) => fact.startsWith('setInterval'))).toHaveLength(1)
    expect(
      native.creations.filter((fact) => fact.startsWith('requestAnimationFrame'))
    ).toHaveLength(1)
    expect(hash(native.creations)).toBe(HEAD_TIMER_CREATION_SHA256)
    expect(native.cleanups.filter((fact) => fact.startsWith('clearTimeout'))).toHaveLength(11)
    expect(native.cleanups.filter((fact) => fact.startsWith('clearInterval'))).toHaveLength(1)
    expect(native.cleanups.filter((fact) => fact.startsWith('cancelAnimationFrame'))).toHaveLength(
      1
    )
    expect(hash(native.cleanups)).toBe(HEAD_TIMER_CLEANUP_SHA256)
    const compatibility = readCompatibilityFacts(definitions)
    expect(compatibility.identityFields).toHaveLength(14)
    expect(hash(compatibility.identityFields)).toBe(HEAD_IDENTITY_FIELD_SHA256)
    expect(compatibility.navigation).toHaveLength(7)
    expect(hash(compatibility.navigation)).toBe(HEAD_NAVIGATION_SHA256)
    expect(compatibility.capabilities).toHaveLength(7)
    expect(hash(compatibility.capabilities)).toBe(HEAD_CAPABILITY_SHA256)
  })

  it('preserves runtime strings, styles, and the expanded JSX tree', () => {
    const strings = readRuntimeStrings()
    expect(strings).toHaveLength(603)
    expect(hash(strings)).toBe(HEAD_RUNTIME_STRING_SHA256)
    const jsx = readJsxFacts(readDefinitions())
    expect(jsx.host).toHaveLength(130)
    expect(hash(jsx.host)).toBe(HEAD_HOST_JSX_SHA256)
    expect(jsx.leaf).toHaveLength(67)
    expect(hash(jsx.leaf)).toBe(HEAD_LEAF_JSX_SHA256)
    expect(jsx.styleReferences).toHaveLength(182)
    expect(hash(jsx.styleReferences)).toBe(HEAD_STYLE_REFERENCE_SHA256)
  })
})
