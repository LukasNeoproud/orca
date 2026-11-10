import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AgentJournalItemIdentity,
  AgentJournalMessageItem
} from '../../shared/agent-session-journal-types'
import { claudeRecord, claudeText } from './claude-structured-item-translation'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}
const MAX_IMAGES_PER_RESULT = 8
/** Base64 characters; about 15 MB of image. */
const MAX_IMAGE_DATA_LENGTH = 20 * 1024 * 1024

let directory = join(tmpdir(), 'orca-claude-tool-images')

/** Where images a tool returned are kept so the transcript can show them after a restart. */
export function setClaudeToolImageDirectory(path: string): void {
  directory = path
}

type ToolResultImage = { extension: string; data: string }

function resultImages(content: unknown): ToolResultImage[] {
  if (!Array.isArray(content)) {
    return []
  }
  return content
    .flatMap((value): ToolResultImage[] => {
      const part = claudeRecord(value)
      const source = claudeRecord(part?.source)
      const extension = EXTENSIONS[claudeText(source?.media_type) ?? '']
      const data = claudeText(source?.data)
      return part?.type === 'image' &&
        source?.type === 'base64' &&
        extension &&
        data &&
        data.length <= MAX_IMAGE_DATA_LENGTH
        ? [{ extension, data }]
        : []
    })
    .slice(0, MAX_IMAGES_PER_RESULT)
}

export function claudeToolImagesIdentity(
  sessionId: string,
  toolUseId: string
): AgentJournalItemIdentity {
  return { provider: 'orca', clientMessageId: `claude-tool-images:${sessionId}:${toolUseId}` }
}

/**
 * The images a tool result carries (a screenshot, a read image), as a row of their own: the tool
 * row's output is text only. Files are named by the call, so a replayed frame rewrites nothing.
 */
export function claudeToolResultImagesBody(
  sessionId: string,
  toolUseId: string,
  content: unknown
): AgentJournalMessageItem | null {
  const images = resultImages(content)
  if (images.length === 0) {
    return null
  }
  const folder = join(directory, sessionId.replace(/[^\w-]/g, '_'))
  const paths: string[] = []
  try {
    mkdirSync(folder, { recursive: true })
    images.forEach((image, index) => {
      const path = join(
        folder,
        `${toolUseId.replace(/[^\w-]/g, '_')}-${index + 1}.${image.extension}`
      )
      if (!existsSync(path)) {
        writeFileSync(path, Buffer.from(image.data, 'base64'))
      }
      paths.push(path)
    })
  } catch {
    // A full or read-only disk loses the picture, never the turn.
  }
  return paths.length > 0
    ? {
        kind: 'message',
        role: 'assistant',
        blocks: paths.map((path) => ({ type: 'image-ref', path }))
      }
    : null
}
