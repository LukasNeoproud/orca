import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { propString, propTrue, readSelectOptions, type ClaudeModsNode } from './claude-mods-tree'
import { claudeModsDispatch, useClaudeModsDrawScope } from './claude-mods-draw-scope'
import { claudeModsControlAttributes } from './claude-mods-focus-sync'

type ElementNode = Extract<ClaudeModsNode, { kind: 'element' }>

/** A change is the field's whole text, so only the latest of a quick burst needs to go. */
const CHANGE_DEBOUNCE_MS = 120

/**
 * The person's typing is the field's own until the mod draws it with another `value`, or a
 * submit lands: the mod redrawing on each keystroke must not take the text back.
 */
export function ClaudeModsInput({ node }: { node: ElementNode }): React.JSX.Element {
  const scope = useClaudeModsDrawScope()
  const { props } = node
  const drawn = propString(props, 'value') ?? ''
  const key = propString(props, 'key')
  const label = propString(props, 'label')
  const [text, setText] = useState(drawn)
  const lastDrawn = useRef(drawn)
  const submitted = useRef(false)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The handle changes with every redraw; a submit's redraw is the one that resets the text.
  const handle = node.press?.handle
  useEffect(() => {
    if (drawn !== lastDrawn.current || submitted.current) {
      lastDrawn.current = drawn
      submitted.current = false
      setText(drawn)
    }
  }, [drawn, handle])
  useEffect(
    () => () => {
      if (pending.current) {
        clearTimeout(pending.current)
      }
    },
    []
  )
  const send = (kind: 'change' | 'submit', value: string): void => {
    if (node.press && scope) {
      void claudeModsDispatch(scope).input(node.press, key, kind, value)
    }
  }
  const submitLabel = propString(props, 'submitLabel')
  const field = (
    <Input
      size="xs"
      value={text}
      placeholder={propString(props, 'placeholder')}
      {...claudeModsControlAttributes(key, node.press?.plugin, propTrue(props, 'autoFocus'))}
      aria-label={label ?? propString(props, 'placeholder') ?? key}
      disabled={!node.press || !scope}
      onChange={(event) => {
        const value = event.target.value
        setText(value)
        if (pending.current) {
          clearTimeout(pending.current)
        }
        pending.current = setTimeout(() => send('change', value), CHANGE_DEBOUNCE_MS)
      }}
      onKeyDown={(event) => {
        // The Enter key and the submit button share the form's one submit path.
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }
      }}
    />
  )
  return (
    <form
      className="inline-flex min-w-0 max-w-full items-center gap-2 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending.current) {
          clearTimeout(pending.current)
          pending.current = null
        }
        submitted.current = true
        send('submit', text)
      }}
    >
      {label ? (
        <label className="inline-flex min-w-0 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
          {field}
        </label>
      ) : (
        field
      )}
      {submitLabel ? (
        <Button type="submit" size="xs" variant="outline" disabled={!node.press || !scope}>
          {submitLabel}
        </Button>
      ) : null}
    </form>
  )
}

/** The label follows the person's pick at once; the mod's next `value` wins over it. */
export function ClaudeModsSelect({ node }: { node: ElementNode }): React.JSX.Element {
  const scope = useClaudeModsDrawScope()
  const { props } = node
  const options = readSelectOptions(props)
  const label = propString(props, 'label')
  const key = propString(props, 'key')
  const drawn = propString(props, 'value') ?? options[0]?.value
  const [selected, setSelected] = useState(drawn)
  // Any new drawing wins, even one repeating the old value: the mod may have refused the pick.
  const [lastNode, setLastNode] = useState(node)
  if (node !== lastNode) {
    setLastNode(node)
    setSelected(drawn)
  }
  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-2 text-sm">
      {label ? (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
      ) : null}
      <Select
        value={selected}
        disabled={!node.press || !scope}
        onValueChange={(value) => {
          setSelected(value)
          if (node.press && scope) {
            claudeModsDispatch(scope).select(node.press, key, value)
          }
        }}
      >
        <SelectTrigger
          size="xs"
          {...claudeModsControlAttributes(key, node.press?.plugin, propTrue(props, 'autoFocus'))}
          aria-label={label ?? key}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
