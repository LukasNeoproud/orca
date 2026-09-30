export type AiResponseComment = {
  id: string
  quote: string
  comment: string
}

export function formatAiResponseComments(comments: readonly AiResponseComment[]): string {
  return comments
    .filter(({ quote, comment }) => quote.trim() && comment.trim())
    .map(({ quote, comment }) => {
      const citation = quote.replace(/\r\n?/g, '\n').split('\n')
      return `${citation.map((line) => `> ${line}`).join('\n')}\n\nComment: ${comment.trim()}`
    })
    .join('\n\n')
}

export function appendAiResponseComments(
  prompt: string,
  comments: readonly AiResponseComment[]
): string {
  const formatted = formatAiResponseComments(comments)
  if (!formatted) {
    return prompt
  }
  return prompt.trim() ? `${prompt}\n\n${formatted}` : formatted
}
