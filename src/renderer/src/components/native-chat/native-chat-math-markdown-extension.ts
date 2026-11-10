import remarkMath from 'remark-math'
import type { CommentMarkdownExtension } from '@/components/sidebar/CommentMarkdown'

// Why `$$…$$` only: a chat is full of single dollars (prices, shell variables) that are not math.
const MATH_REMARK_PLUGINS: CommentMarkdownExtension['remarkPlugins'] = [
  [remarkMath, { singleDollarTextMath: false }]
]

const MATH_ONLY: CommentMarkdownExtension = {
  remarkPlugins: MATH_REMARK_PLUGINS,
  sanitizeAttributes: {},
  components: {}
}

/** The chat's markdown extension with `$$` math parsed; KaTeX draws it after sanitize. */
export function withNativeChatMath(
  extension: CommentMarkdownExtension | undefined
): CommentMarkdownExtension {
  return extension
    ? { ...extension, remarkPlugins: [...extension.remarkPlugins, ...MATH_REMARK_PLUGINS] }
    : MATH_ONLY
}
