// Minimal standalone runtime for the prototype's .dc.html screens: holes, sc-for, sc-if, dc-import, state.
;(() => {
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g
  const WHOLE_HOLE = /^\{\{\s*([^}]+?)\s*\}\}$/
  const registry = new Map()
  const sources = new Map()

  class DCLogic {
    constructor(props) {
      this.props = props
      this.state = {}
    }
    setState(patch) {
      this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) }
      this.forceUpdate()
    }
    forceUpdate() {
      if (this.__mount) {
        this.__mount()
      }
    }
  }

  window.__dcRegister = (id, Component) => registry.set(id, Component)

  function lookup(path, scope) {
    if (path === 'true') {
      return true
    }
    if (path === 'false') {
      return false
    }
    if (/^-?\d+(\.\d+)?$/.test(path)) {
      return Number(path)
    }
    return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), scope)
  }

  function interpolate(text, scope) {
    return text.replace(HOLE, (_, path) => {
      const value = lookup(path, scope)
      return value == null ? '' : String(value)
    })
  }

  function eventName(attrName, element) {
    const name = attrName.slice(2).toLowerCase()
    const tag = element.tagName.toLowerCase()
    const textual =
      tag === 'textarea' || (tag === 'input' && !['checkbox', 'radio'].includes(element.type))
    return name === 'change' && textual ? 'input' : name
  }

  function applyAttributes(source, target, scope, deferred) {
    for (const attr of Array.from(source.attributes)) {
      const name = attr.name
      if (name.startsWith('hint-')) {
        continue
      }
      const whole = attr.value.match(WHOLE_HOLE)
      if (name.startsWith('on') && whole) {
        const handler = lookup(whole[1], scope)
        if (typeof handler === 'function') {
          target.addEventListener(eventName(name, target), handler)
        }
        continue
      }
      const value = whole ? lookup(whole[1], scope) : interpolate(attr.value, scope)
      if (name === 'checked') {
        deferred.push(() => {
          target.checked = Boolean(value)
        })
      } else if (name === 'value' && /^(input|textarea|select)$/i.test(target.tagName)) {
        deferred.push(() => {
          target.value = value == null ? '' : String(value)
        })
      } else if (value === false || value == null) {
        target.removeAttribute(name)
      } else {
        target.setAttribute(name, String(value))
      }
    }
  }

  function expand(node, scope, owner, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(document.createTextNode(interpolate(node.nodeValue, scope)))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }
    const tag = node.tagName.toLowerCase()
    if (tag === 'helmet') {
      return
    }
    if (tag === 'sc-if') {
      const cond = lookup(node.getAttribute('value').match(WHOLE_HOLE)[1], scope)
      if (cond) {
        node.childNodes.forEach((child) => expand(child, scope, owner, out))
      }
      return
    }
    if (tag === 'sc-for') {
      const list = lookup(node.getAttribute('list').match(WHOLE_HOLE)[1], scope) || []
      const as = node.getAttribute('as')
      list.forEach((item, index) => {
        const inner = { ...scope, [as]: item, $index: index }
        node.childNodes.forEach((child) => expand(child, inner, owner, out))
      })
      return
    }
    if (tag === 'dc-import') {
      out.push(owner.importHost(node, scope))
      return
    }
    const element =
      node.namespaceURI === 'http://www.w3.org/2000/svg'
        ? document.createElementNS(node.namespaceURI, node.tagName)
        : document.createElement(node.tagName)
    const deferred = []
    applyAttributes(node, element, scope, deferred)
    const children = []
    node.childNodes.forEach((child) => expand(child, scope, owner, children))
    children.forEach((child) => element.appendChild(child))
    deferred.forEach((run) => run())
    out.push(element)
  }

  function installHelmet(template) {
    const helmet = template.querySelector('helmet')
    if (!helmet) {
      return
    }
    for (const child of Array.from(helmet.children)) {
      const href = child.getAttribute('href')
      if (href && document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) {
        continue
      }
      document.head.appendChild(child.cloneNode(true))
    }
  }

  function defineComponent(id, scriptText) {
    if (!registry.has(id)) {
      const script = document.createElement('script')
      script.textContent = `{\n${scriptText}\nwindow.__dcRegister(${JSON.stringify(id)}, Component)\n}`
      document.head.appendChild(script)
    }
    return registry.get(id)
  }

  function camelCase(name) {
    return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  }

  async function loadSource(name) {
    if (!sources.has(name)) {
      sources.set(
        name,
        fetch(`./${name}.dc.html`)
          .then((res) => res.text())
          .then((html) => new DOMParser().parseFromString(html, 'text/html'))
      )
    }
    return sources.get(name)
  }

  function mount(id, template, scriptText, props, host) {
    installHelmet(template)
    const Component = defineComponent(id, scriptText)
    const instance = new Component(props)
    const imports = new Map()
    instance.importHost = (node, scope) => {
      const name = node.getAttribute('name')
      const childProps = {}
      for (const attr of Array.from(node.attributes)) {
        if (attr.name === 'name' || attr.name.startsWith('hint-')) {
          continue
        }
        const whole = attr.value.match(WHOLE_HOLE)
        childProps[camelCase(attr.name)] = whole
          ? lookup(whole[1], scope)
          : interpolate(attr.value, scope)
      }
      const key = `${name}:${JSON.stringify(childProps)}`
      if (!imports.has(key)) {
        const childHost = document.createElement('div')
        childHost.style.display = 'contents'
        imports.set(key, childHost)
        loadSource(name).then((doc) => {
          const childTemplate = doc.querySelector('x-dc')
          const childScript = doc.querySelector('script[data-dc-script]').textContent
          mount(name, childTemplate, childScript, childProps, childHost)
        })
      }
      return imports.get(key)
    }
    instance.__mount = () => {
      const active = document.activeElement
      const focusId = active && active.id && host.contains(active) ? active.id : null
      const selection =
        focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null
      const out = []
      template.childNodes.forEach((child) => expand(child, instance.renderVals(), instance, out))
      host.replaceChildren(...out)
      if (focusId) {
        const next = document.getElementById(focusId)
        if (next) {
          next.focus()
          if (selection && 'setSelectionRange' in next) {
            next.setSelectionRange(selection[0], selection[1])
          }
        }
      }
    }
    instance.__mount()
  }

  window.DCLogic = DCLogic

  document.addEventListener('DOMContentLoaded', () => {
    const template = document.querySelector('x-dc')
    const script = document.querySelector('script[data-dc-script]')
    if (!template || !script) {
      return
    }
    const id = location.pathname.split('/').pop().replace('.dc.html', '')
    const host = document.createElement('div')
    template.replaceWith(host)
    mount(id, template, script.textContent, {}, host)
  })
})()
