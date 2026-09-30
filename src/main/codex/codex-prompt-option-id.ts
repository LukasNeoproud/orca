export function encodeCodexQuestionOptionId(questionId: string, answer: string): string {
  return `${encodeURIComponent(questionId)}:${encodeURIComponent(answer)}`
}

export function decodeCodexQuestionOptionId(
  optionId: string
): { questionId: string; answer: string } | null {
  const separator = optionId.indexOf(':')
  if (separator <= 0) {
    return null
  }
  try {
    return {
      questionId: decodeURIComponent(optionId.slice(0, separator)),
      answer: decodeURIComponent(optionId.slice(separator + 1))
    }
  } catch {
    return null
  }
}
