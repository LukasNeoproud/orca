export type FileKind =
  | 'code'
  | 'image'
  | 'markdown'
  | 'diagram'
  | 'json'
  | 'yaml'
  | 'csv'
  | 'pdf'
  | 'report'
  | 'chart'
  | 'html'
  | 'web'
  | 'binary'
export type PreviewFile = {
  id: string
  name: string
  path: string
  kind: FileKind
  meta: string
  status?: 'changed' | 'missing' | 'offline' | 'large'
}
export const files: PreviewFile[] = [
  {
    id: 'screen',
    name: 'account-settings.png',
    path: 'screenshots/account-settings.png',
    kind: 'image',
    meta: '1440 × 900 · 128 KB'
  },
  {
    id: 'code',
    name: 'AccountSettings.tsx',
    path: 'src/components/AccountSettings.tsx:42–51',
    kind: 'code',
    meta: 'TypeScript · řádky 42–51'
  },
  {
    id: 'md',
    name: 'account-settings.md',
    path: 'docs/account-settings.md',
    kind: 'markdown',
    meta: 'Markdown · 2,4 KB'
  },
  {
    id: 'diagram',
    name: 'save-flow.mmd',
    path: 'docs/save-flow.mmd',
    kind: 'diagram',
    meta: 'Mermaid · průběh ukládání'
  },
  {
    id: 'json',
    name: 'preferences.json',
    path: 'fixtures/preferences.json',
    kind: 'json',
    meta: 'JSON · 3 položky'
  },
  {
    id: 'yaml',
    name: 'preview.yml',
    path: 'config/preview.yml',
    kind: 'yaml',
    meta: 'YAML · 4 položky'
  },
  {
    id: 'csv',
    name: 'measurements.csv',
    path: 'reports/measurements.csv',
    kind: 'csv',
    meta: 'CSV · 3 řádky'
  },
  {
    id: 'pdf',
    name: 'specification.pdf',
    path: 'docs/specification.pdf',
    kind: 'pdf',
    meta: 'PDF · 6 stran · 284 KB'
  },
  {
    id: 'report',
    name: 'test-results.json',
    path: 'reports/test-results.json',
    kind: 'report',
    meta: 'Test report · ukázkový podporovaný formát'
  },
  {
    id: 'chart',
    name: 'render-duration.svg',
    path: 'reports/render-duration.svg',
    kind: 'chart',
    meta: 'SVG · doba vykreslení'
  },
  {
    id: 'html',
    name: 'account.html',
    path: 'prototypes/account.html',
    kind: 'html',
    meta: 'HTML · izolovaný náhled'
  },
  {
    id: 'web',
    name: 'Dokumentace přístupnosti',
    path: 'https://www.w3.org/WAI/',
    kind: 'web',
    meta: 'w3.org · metadata z odpovědi nástroje'
  },
  {
    id: 'binary',
    name: 'assets.zip',
    path: 'exports/assets.zip',
    kind: 'binary',
    meta: 'ZIP · 8,2 MB'
  },
  {
    id: 'changed',
    name: 'AccountSettings.tsx',
    path: 'src/components/AccountSettings.tsx:42–51',
    kind: 'code',
    meta: 'Aktuální obsah · původní zpráva 09:14',
    status: 'changed'
  },
  {
    id: 'missing',
    name: 'old-layout.png',
    path: 'screenshots/old-layout.png',
    kind: 'image',
    meta: 'Soubor již není na původní cestě',
    status: 'missing'
  },
  {
    id: 'offline',
    name: 'remote-screen.png',
    path: '/srv/orca/screenshots/remote-screen.png',
    kind: 'image',
    meta: 'SSH · build-server · spojení nedostupné',
    status: 'offline'
  },
  {
    id: 'large',
    name: 'diagnostics.log',
    path: '/workspace/reports/diagnostics.log',
    kind: 'code',
    meta: 'Text · 42 MB',
    status: 'large'
  }
]
export const code = `export function AccountSettings() {
  const [saving, setSaving] = useState(false)

  async function saveChanges() {
    setSaving(true)
    try {
      await updatePreferences(preferences)
    } finally {
      setSaving(false)
    }
  }
}`
export const diagram =
  'flowchart LR\n  A[Změna nastavení] --> B[Uložit]\n  B --> C{Výsledek}\n  C --> D[Uloženo]\n  C --> E[Zkusit znovu]'
export const html =
  '<!doctype html><html lang="cs"><body style="font:14px system-ui;padding:32px;background:#fafafa;color:#171717"><p>ÚČET / NASTAVENÍ</p><h2>Váš pracovní prostor</h2><p>Změny se uloží až po potvrzení.</p><label>Název <input value="Orca workspace"></label><p><button onclick="document.getElementById(\'state\').textContent=\'Ukázkové nastavení uloženo\'">Uložit změny</button></p><p id="state" role="status"></p></body></html>'
export const scenarios = [
  {
    id: 'daily',
    title: 'Běžná konverzace',
    description: 'Cesty a URL přímo ve větách',
    count: '01'
  },
  { id: 'formats', title: 'Galerie formátů', description: '13 podob jednoho odkazu', count: '02' },
  {
    id: 'states',
    title: 'Život odkazu',
    description: 'Změna, smazání, SSH, velký soubor',
    count: '03'
  },
  {
    id: 'tools',
    title: 'Editace a skripty',
    description: 'Co patří do historie nástrojů',
    count: '04'
  },
  { id: 'review', title: 'Kontrola změn', description: 'Source Control a komentáře', count: '05' }
]
