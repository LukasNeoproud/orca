import { useMemo } from 'react'
import { Button } from '../../ui/button'
import { ShortcutKeyCombo } from '../../ShortcutKeyCombo'
import { NativeChatMarkdown } from '../NativeChatMarkdown'
import { NativeChatHighlightedCode } from '../NativeChatHighlightedCode'
import { NativeChatDiffView } from '../NativeChatDiffView'
import { diffFromText } from '../native-chat-diff'
import { claudeModsDeclarationStyle, claudeModsTextStyle } from './claude-mods-style'
import {
  claudeModsHoveredBoxStyle,
  claudeModsHoveredTextProps,
  claudeModsHoveredTextStyle
} from './claude-mods-hover-style'
import { ClaudeModsHoverBoxContext, useClaudeModsHoverNode } from './claude-mods-hover-node'
import { isClaudeModsHoverKey } from './claude-mods-hover-store'
import {
  CLAUDE_MODS_KEY_ATTRIBUTE,
  CLAUDE_MODS_OWNER_ATTRIBUTE
} from './claude-mods-layout-measure'
import { claudeModsControlAttributes } from './claude-mods-focus-sync'
import {
  keyedClaudeModsChildren,
  propNumber,
  propString,
  propTrue,
  type ClaudeModsNode
} from './claude-mods-tree'
import { claudeModsDispatch, useClaudeModsDrawScope } from './claude-mods-draw-scope'
import { claudeModsStringContent } from './claude-mods-text-heuristics'
import { ClaudeModsInput, ClaudeModsSelect } from './ClaudeModsFields'
import { ClaudeModsSvg } from './ClaudeModsSvg'
import { ClaudeModsClientRegion } from './client/ClaudeModsClientRegion'

/** Links a mod draws open outside the app, and only these: the engine already bounded them. */
export function isClaudeModsOpenableUrl(href: string | undefined): href is string {
  if (!href) {
    return false
  }
  try {
    const url = new URL(href)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')
  } catch {
    return false
  }
}

function openClaudeModsUrl(href: string | undefined): void {
  if (isClaudeModsOpenableUrl(href)) {
    void window.api.shell.openUrl(href)
  }
}

export function ClaudeModsNodeView({ node }: { node: ClaudeModsNode }): React.JSX.Element | null {
  const scope = useClaudeModsDrawScope()
  if (node.kind === 'text') {
    return <>{node.text}</>
  }
  if (node.kind === 'engine') {
    return scope?.renderEngine ? <>{scope.renderEngine(node.ref)}</> : null
  }
  return <ClaudeModsElementView node={node} />
}

function ClaudeModsChildren({ nodes }: { nodes: ClaudeModsNode[] }): React.JSX.Element {
  return (
    <>
      {keyedClaudeModsChildren(nodes).map(([key, child]) => (
        <ClaudeModsNodeView key={key} node={child} />
      ))}
    </>
  )
}

type ElementNode = Extract<ClaudeModsNode, { kind: 'element' }>

function ClaudeModsElementView({ node }: { node: ElementNode }): React.JSX.Element | null {
  const { props } = node
  switch (node.type) {
    case 'Box':
      return <ClaudeModsBox node={node} />
    case 'Text':
      return <ClaudeModsText node={node} />
    case 'div':
      return (
        <div style={claudeModsDeclarationStyle(props.style)}>
          <ClaudeModsChildren nodes={node.children} />
        </div>
      )
    case 'span':
      return (
        <span style={claudeModsDeclarationStyle(props.style)}>
          <ClaudeModsChildren nodes={node.children} />
        </span>
      )
    case 'b':
      return (
        <b style={claudeModsDeclarationStyle(props.style)}>
          <ClaudeModsChildren nodes={node.children} />
        </b>
      )
    case 'Button':
      return <ClaudeModsButton node={node} />
    case 'Input':
      return <ClaudeModsInput node={node} />
    case 'Select':
      return <ClaudeModsSelect node={node} />
    case 'Link':
      return <ClaudeModsLink node={node} />
    case 'Code':
      return <ClaudeModsCode props={props} />
    case 'Markdown':
      return <ClaudeModsMarkdown node={node} />
    case 'Svg':
      return <ClaudeModsSvg props={props} />
    case 'Client':
      return <ClaudeModsClientSlot node={node} />
  }
}

function ClaudeModsBox({ node }: { node: ElementNode }): React.JSX.Element {
  const { props } = node
  const hover = useClaudeModsHoverNode({
    boxKey: props.key,
    hover: node.hover,
    owner: node.group
  })
  const key = isClaudeModsHoverKey(props.key) ? props.key : undefined
  // A row of text next to a button lines up on the middle unless the mod chose an alignment.
  const centresInline =
    (props.flexDirection === undefined || props.flexDirection === 'row') &&
    props.alignItems === undefined
  const box = (
    <div
      className={
        centresInline
          ? '[&>a]:self-center [&>b]:self-center [&>button]:self-center [&>span]:self-center'
          : undefined
      }
      data-claude-mods-plugin={node.plugin}
      {...(key && node.owner
        ? { [CLAUDE_MODS_KEY_ATTRIBUTE]: key, [CLAUDE_MODS_OWNER_ATTRIBUTE]: node.owner }
        : {})}
      style={claudeModsHoveredBoxStyle(props, node.hover, hover.lit)}
      ref={hover.hoverRef}
    >
      {keyedClaudeModsChildren(node.children).map(([childKey, child]) =>
        child.kind === 'text' ? (
          <span key={childKey} style={claudeModsTextStyle({})}>
            {child.text}
          </span>
        ) : (
          <ClaudeModsNodeView key={childKey} node={child} />
        )
      )}
    </div>
  )
  return key ? (
    <ClaudeModsHoverBoxContext.Provider value={hover.contextId}>
      {box}
    </ClaudeModsHoverBoxContext.Provider>
  ) : (
    box
  )
}

function ClaudeModsText({ node }: { node: ElementNode }): React.JSX.Element {
  const hover = useClaudeModsHoverNode({ hover: node.hover, owner: node.group })
  return (
    <span
      data-claude-mods-plugin={node.plugin}
      style={claudeModsHoveredTextStyle(
        node.props,
        node.hover,
        hover.lit,
        claudeModsStringContent(node.children)
      )}
      ref={hover.hoverRef}
    >
      <ClaudeModsChildren nodes={node.children} />
    </span>
  )
}

function ClaudeModsButton({ node }: { node: ElementNode }): React.JSX.Element {
  const scope = useClaudeModsDrawScope()
  const { props } = node
  const label = propString(props, 'label') ?? ''
  const hotkey = propString(props, 'hotkey')
  const key = propString(props, 'key')
  const plain = propTrue(props, 'plain')
  const variant = plain ? 'ghost' : props.variant === 'primary' ? 'default' : 'outline'
  const hover = useClaudeModsHoverNode({ hover: node.hover, owner: node.press?.plugin })
  const labelProps = claudeModsHoveredTextProps(
    { dimColor: propTrue(props, 'dimColor') },
    hover.lit ? node.hover : undefined
  )
  const dim = labelProps.dimColor === true
  return (
    <Button
      type="button"
      size="xs"
      variant={variant}
      className="group/mods"
      aria-label={node.children.length > 0 && label ? label : undefined}
      {...claudeModsControlAttributes(key, node.press?.plugin, propTrue(props, 'autoFocus'))}
      ref={hover.hoverRef}
      onClick={() => {
        if (node.press && scope) {
          claudeModsDispatch(scope).press(node.press, key)
        }
      }}
    >
      {hotkey && plain ? <ShortcutKeyCombo keys={[hotkey.toUpperCase()]} /> : null}
      {/* Full strength under the pointer or the ring, as a dim label is at rest only. */}
      <span
        className={
          dim ? 'opacity-60 group-hover/mods:opacity-100 group-focus-visible/mods:opacity-100' : ''
        }
        style={{ ...claudeModsTextStyle({ ...labelProps, dimColor: false }), whiteSpace: 'nowrap' }}
      >
        {node.children.length > 0 ? <ClaudeModsChildren nodes={node.children} /> : label}
      </span>
      {hotkey && !plain ? <ShortcutKeyCombo keys={[hotkey.toUpperCase()]} /> : null}
    </Button>
  )
}

function ClaudeModsLink({ node }: { node: ElementNode }): React.JSX.Element {
  const href = propString(node.props, 'href')
  const label = node.children.length > 0 ? null : (propString(node.props, 'label') ?? href)
  if (!isClaudeModsOpenableUrl(href)) {
    return (
      <span>
        {label}
        <ClaudeModsChildren nodes={node.children} />
      </span>
    )
  }
  return (
    <a
      href={href}
      className="w-fit max-w-full rounded-sm text-chat-foreground-strong underline decoration-current/40 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        event.preventDefault()
        openClaudeModsUrl(href)
      }}
    >
      {label}
      <ClaudeModsChildren nodes={node.children} />
    </a>
  )
}

function ClaudeModsCode({ props }: { props: Record<string, unknown> }): React.JSX.Element {
  const source = propString(props, 'source') ?? ''
  const language = propString(props, 'language')
  const startLine = propNumber(props, 'startLine')
  const diff = useMemo(
    () => (props.format === 'diff' ? diffFromText(source) : null),
    [props.format, source]
  )
  if (diff) {
    return <NativeChatDiffView lines={diff} />
  }
  const truncates = props.wrap === 'truncate-end'
  return (
    <pre
      data-native-chat-code-content
      className="m-0 min-w-0 max-w-full overflow-x-auto rounded-lg border border-chat-code-border bg-chat-code-surface p-2 font-mono text-chat-code text-chat-code-foreground"
      style={{ whiteSpace: truncates ? 'pre' : 'pre-wrap', overflowWrap: 'anywhere' }}
    >
      {startLine === undefined ? null : (
        <span
          aria-hidden
          className="float-left mr-3 select-none text-right text-chat-foreground-faint"
        >
          {source.split('\n').map((_line, index) => (
            <span key={index} className="block">
              {startLine + index}
            </span>
          ))}
        </span>
      )}
      <code>
        {language ? <NativeChatHighlightedCode code={source} language={language} /> : source}
      </code>
    </pre>
  )
}

function ClaudeModsMarkdown({ node }: { node: ElementNode }): React.JSX.Element {
  const scope = useClaudeModsDrawScope()
  const text = propString(node.props, 'text') ?? ''
  const pressable = Array.isArray(node.props.pressableLinks)
    ? node.props.pressableLinks.filter((href): href is string => typeof href === 'string')
    : null
  return (
    <div style={propTrue(node.props, 'dimColor') ? { opacity: 0.6 } : undefined}>
      <NativeChatMarkdown
        content={text}
        onLinkClick={(event, href) => {
          event.preventDefault()
          // A Markdown with `press` answers its own links; the surface does not open them.
          if (node.press && scope && href && (!pressable || pressable.includes(href))) {
            claudeModsDispatch(scope).press(node.press, propString(node.props, 'key'), href)
            return
          }
          openClaudeModsUrl(href)
        }}
      />
    </div>
  )
}

function ClaudeModsClientSlot({ node }: { node: ElementNode }): React.JSX.Element {
  const scope = useClaudeModsDrawScope()
  return (
    <ClaudeModsClientRegion
      node={node}
      {...(scope?.clientModules ? { clientModules: scope.clientModules } : {})}
      {...(scope?.redrawSite ? { redraw: scope.redrawSite } : {})}
    />
  )
}
