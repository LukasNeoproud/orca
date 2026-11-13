import type { RasterImageDimensions } from './raster-image-dimensions'

export type RuntimeFileListEntry = {
  relativePath: string
  basename: string
  kind: 'text' | 'binary'
}

export type RuntimeFileListResult = {
  worktree: string
  rootPath: string
  files: RuntimeFileListEntry[]
  totalCount: number
  truncated: boolean
  quickOpenSearchVersion?: number
}

export type RuntimeFileOpenResult = {
  worktree: string
  relativePath: string
  kind: 'markdown' | 'text' | 'binary' | 'image'
  opened: boolean
}

export type RuntimeFileReadResult = {
  worktree: string
  relativePath: string
  content: string
  truncated: boolean
  byteLength: number
}

export type RuntimeTerminalPathOpenTarget =
  | {
      kind: 'worktree-file'
      provider: 'local' | 'ssh'
      relativePath: string
      absolutePath: string
    }
  | {
      kind: 'absolute-file'
      provider: 'local' | 'ssh'
      absolutePath: string
      grantId: string
      readOnly?: true
    }
  | { kind: 'unsupported'; reason: string }

export type RuntimeNativeChatFileContext = {
  tabId: string
  sessionId: string
}

// Why: older hosts ignore crossWorkspace, so their refusal is no proof that no host workspace holds the path.
export const TERMINAL_PATH_CROSS_WORKSPACE_RUNTIME_CAPABILITY =
  'files.resolve-terminal-path.cross-workspace.v1' as const

export type RuntimeTerminalPathResolution = {
  worktree: string
  relativePath: string | null
  absolutePath: string | null
  exists: boolean
  isDirectory: boolean
  openTarget?: RuntimeTerminalPathOpenTarget
}

export type RuntimeFilePreviewResult = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  imageDimensions?: RasterImageDimensions
}

export type RuntimeFileReadChunkResult = {
  contentBase64: string
  /** Length of the raw range, whatever `encoding` the content travels in. */
  bytesRead: number
  eof: boolean
  /** Set only for a caller that sent `acceptGzip`: `contentBase64` is then gzip of the range. */
  encoding?: 'gzip'
  /** The content went ahead in a binary frame with the caller's `binaryFrameToken`. */
  binaryFrame?: true
}
