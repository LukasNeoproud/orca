export type NativeChatPreviewKind =
  | 'image'
  | 'pdf'
  | 'markdown'
  | 'mermaid'
  | 'json'
  | 'yaml'
  | 'csv'
  | 'html'
  | 'report'
  | 'code'
  | 'unsupported'

const codeExtensions = new Set([
  'asm',
  'bash',
  'bat',
  'c',
  'cc',
  'clj',
  'cpp',
  'cs',
  'css',
  'dart',
  'env',
  'ex',
  'exs',
  'fish',
  'go',
  'h',
  'hpp',
  'java',
  'js',
  'jsx',
  'kt',
  'kts',
  'less',
  'lua',
  'm',
  'mm',
  'php',
  'txt',
  'log',
  'pl',
  'ps1',
  'py',
  'r',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'vue',
  'xml',
  'zig'
])
const imageExtensions = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'])

export function nativeChatPreviewKind(filePath: string, mimeType?: string): NativeChatPreviewKind {
  const name = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  const extension = name.includes('.') ? (name.split('.').pop() ?? '') : ''
  if (imageExtensions.has(extension) || mimeType?.startsWith('image/')) {
    return 'image'
  }
  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf'
  }
  if (extension === 'md' || extension === 'mdx' || extension === 'markdown') {
    return 'markdown'
  }
  if (extension === 'mmd' || extension === 'mermaid') {
    return 'mermaid'
  }
  if (
    extension === 'tap' ||
    /\.(?:junit|tap|test-results|test-report)\.(?:xml|json|txt)$/.test(name) ||
    /^(?:junit|test-results|test-report)\.(?:xml|json)$/.test(name)
  ) {
    return 'report'
  }
  if (extension === 'json' || extension === 'jsonc' || mimeType === 'application/json') {
    return 'json'
  }
  if (extension === 'yaml' || extension === 'yml') {
    return 'yaml'
  }
  if (extension === 'csv' || extension === 'tsv' || mimeType === 'text/csv') {
    return 'csv'
  }
  if (extension === 'html' || extension === 'htm' || mimeType === 'text/html') {
    return 'html'
  }
  if (
    codeExtensions.has(extension) ||
    name === 'dockerfile' ||
    name === 'makefile' ||
    mimeType?.startsWith('text/')
  ) {
    return 'code'
  }
  return 'unsupported'
}

export function previewCodeLanguage(filePath: string): string | undefined {
  const name = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') {
    return 'dockerfile'
  }
  const ext = name.split('.').pop() ?? ''
  return (
    (
      {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        py: 'python',
        rb: 'ruby',
        rs: 'rust',
        kt: 'kotlin',
        kts: 'kotlin',
        sh: 'bash',
        h: 'cpp',
        cc: 'cpp',
        yml: 'yaml',
        md: 'markdown',
        mmd: 'mermaid'
      } as Record<string, string>
    )[ext] ||
    ext ||
    undefined
  )
}
