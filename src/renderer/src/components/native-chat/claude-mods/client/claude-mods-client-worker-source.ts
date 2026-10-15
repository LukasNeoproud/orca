// The bootstrap of a plugin's surface-module worker, run from a data: URL because Orca's
// packaged renderer is a file:// page, where a blob: worker refuses to start. Inside, it makes
// blob: URLs for the served files itself, keeps what the host needs, and withholds the network,
// storage, timers and code-from-text before any of the plugin's code runs. Kept as plain text so
// no bundler or coverage transform reaches into it; it must stay free of backticks.
// A computed import(expr) is syntax and cannot be withheld: it relies on the CLI rewriting it to
// surface-unlinked:///computed#..., which resolves nowhere because this bootstrap provides no
// import map and its data: base URL resolves no relative specifier.

const WORKER_SOURCE = String.raw`'use strict';
const g = globalThis;
const send = g.postMessage.bind(g);
const startInterval = g.setInterval.bind(g);
const stopInterval = g.clearInterval.bind(g);
const makeUrl = URL.createObjectURL.bind(URL);
const BlobOf = Blob;
const realConsole = g.console;
const stringify = JSON.stringify;
const MIN_INTERVAL_MS = 16;
const MAX_REASON_CHARS = 1000;
const WITHHELD = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource',
  'importScripts', 'indexedDB', 'caches', 'cookieStore', 'BroadcastChannel', 'Worker',
  'SharedWorker', 'fetchLater', 'Notification', 'FontFace', 'fonts', 'WebAssembly', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'postMessage',
  'close', 'eval', 'RTCPeerConnection', 'RTCDataChannel', 'RTCRtpScriptTransformer',
  'webkitRequestFileSystem', 'webkitRequestFileSystemSync', 'webkitResolveLocalFileSystemURL'
];
const WITHHELD_FROM_NAVIGATOR = ['sendBeacon', 'serviceWorker', 'storage', 'locks'];
let api = null;
const urls = new Map();
const namespaces = new Map();
const timers = new Map();
let nextTimer = 0;

const reasonOf = (error) => {
  try {
    const message = typeof error === 'object' && error !== null ? error.message : error;
    return (typeof message === 'string' ? message : String(message)).slice(0, MAX_REASON_CHARS);
  } catch {
    return 'a failure that could not be read';
  }
};

const withhold = (name, target = g) => {
  for (let owner = target; owner && owner !== Object.prototype; owner = Object.getPrototypeOf(owner)) {
    try { delete owner[name]; } catch {}
  }
  try {
    Object.defineProperty(target, name, { value: undefined, writable: false, configurable: false });
  } catch {}
};

const refuseCode = function () { throw new TypeError('a surface module runs no code from text'); };
const sealCodeFromText = () => {
  refuseCode.prototype = Function.prototype;
  const kinds = [function () {}, async function () {}, function* () {}, async function* () {}];
  for (const kind of kinds) {
    try {
      Object.defineProperty(Object.getPrototypeOf(kind), 'constructor', {
        value: refuseCode, writable: false, configurable: false
      });
    } catch {}
  }
  try {
    Object.defineProperty(g, 'Function', { value: refuseCode, writable: false, configurable: false });
  } catch {}
};

const sandbox = (plugin) => {
  const prefix = '[' + plugin + '] surface';
  const say = (level) => (...args) => realConsole[level](prefix, ...args);
  const console = Object.freeze({
    log: say('log'), info: say('info'), warn: say('warn'), error: say('error'), debug: say('debug')
  });
  const nav = g.navigator;
  if (nav) for (const name of WITHHELD_FROM_NAVIGATOR) withhold(name, nav);
  for (const name of WITHHELD) withhold(name);
  try { delete URL.createObjectURL; } catch {}
  try { delete URL.revokeObjectURL; } catch {}
  sealCodeFromText();
  Object.defineProperty(g, 'console', { value: console, writable: false, configurable: false });
};

const stopTimers = (id) => {
  const own = timers.get(id);
  if (!own) return;
  for (const interval of own.values()) stopInterval(interval);
  timers.delete(id);
};

const host = Object.freeze({
  schedule: (id) => send({ type: 'schedule', id }),
  post: (id, text) => send({ type: 'post', id, text: String(text) }),
  startTimer: (id, interval) => {
    const handle = ++nextTimer;
    const ms = Math.max(MIN_INTERVAL_MS, typeof interval === 'number' ? interval : 0);
    const own = timers.get(id) ?? new Map();
    timers.set(id, own);
    own.set(handle, startInterval(() => send({ type: 'tick', id, handle }), ms));
    return handle;
  },
  stopTimer: (id, handle) => {
    const own = timers.get(id);
    const interval = own && own.get(handle);
    if (interval === undefined) return;
    stopInterval(interval);
    own.delete(handle);
  },
  fault: (id, reason) => send({ type: 'fault', id, reason: String(reason).slice(0, MAX_REASON_CHARS) })
});

const load = async (call) => {
  for (const file of call.files) {
    const text = file.parts
      .map((part) => typeof part === 'string'
        ? part
        : stringify(urls.get(part.link) ?? 'orca-unlinked:' + encodeURIComponent(part.link)))
      .join('');
    urls.set(file.key, makeUrl(new BlobOf([text], { type: 'text/javascript' })));
  }
  sandbox(call.plugin);
  const runtime = await import(urls.get(call.runtime));
  for (const [name, value] of [['h', runtime.h], ['Fragment', runtime.Fragment]]) {
    Object.defineProperty(g, name, { value, writable: false, configurable: false });
  }
  api = runtime.install(host, call.limits);
};

const mount = async (call) => {
  const url = urls.get(call.entry);
  if (url === undefined) throw new Error('the plugin loaded no surface module at ' + call.entry);
  let pending = namespaces.get(call.entry);
  if (!pending) {
    pending = import(url);
    namespaces.set(call.entry, pending);
  }
  let namespace;
  try {
    namespace = await pending;
  } catch (error) {
    throw new Error('the surface module did not load: ' + reasonOf(error));
  }
  const component = namespace[call.component];
  if (typeof component !== 'function') {
    throw new Error('its export ' + call.component + ' is not a function (props, surface) => tree');
  }
  api.mount(call.id, component, call.props);
};

const run = (id, kind, payload) => {
  api.stage(id, kind, payload);
  return g.__surface__.run();
};

const OPS = Object.freeze({
  __proto__: null,
  load,
  mount,
  resize: (call) => api.resize(call.id, call.columns, call.rows),
  setProps: (call) => api.setProps(call.id, call.props),
  render: (call) => {
    const text = run(call.id, 'render');
    if (typeof text !== 'string') throw new Error('its render answered no tree');
    return text;
  },
  act: (call) => { run(call.id, call.kind, call.payload); },
  unmount: (call) => { stopTimers(call.id); api.unmount(call.id); }
});

g.addEventListener('message', async (event) => {
  const call = event.data;
  if (typeof call !== 'object' || call === null) return;
  if (call.op === 'dropHeld') {
    if (api) api.dropHeld(call.id, call.handles);
    return;
  }
  const op = OPS[call.op];
  try {
    if (!op) throw new Error('unknown surface call ' + call.op);
    if (call.op !== 'load' && !api) throw new Error('the surface runtime is not loaded');
    // The renderer times a call from here, not from when it waited behind another instance's.
    send({ type: 'begin', seq: call.seq });
    const value = await op(call);
    const listeners = api && typeof call.id === 'string' && call.op !== 'unmount'
      ? { key: api.hasListener(call.id, 'key'), pointer: api.hasListener(call.id, 'pointer') }
      : undefined;
    send({ type: 'answer', seq: call.seq, ok: true, value, listeners });
  } catch (error) {
    send({ type: 'answer', seq: call.seq, ok: false, reason: reasonOf(error) });
  }
});
`

/** The worker's script URL; a data: URL so it starts from a file:// page too. */
export function claudeModsClientWorkerUrl(): string {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(WORKER_SOURCE)}`
}

export const CLAUDE_MODS_CLIENT_WORKER_SOURCE = WORKER_SOURCE
