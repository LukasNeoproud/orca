export function isMobileTerminalResponseCommentTargetActive(
  draftHandle: string,
  activeHandle: string | null,
  activeTabType: string | null
): boolean {
  return draftHandle === activeHandle && activeTabType === 'terminal'
}
