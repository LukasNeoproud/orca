export function emptyMobileConversationBranchController() {
  const noop = (): void => undefined
  return {
    supported: false,
    family: { branches: [], returns: [] },
    familyVisible: false,
    setFamilyVisible: noop,
    selection: null,
    setSelection: noop,
    updateDraft: noop,
    openBranch: noop,
    prepare: noop,
    canPrepare: false,
    start: noop,
    navigate: noop,
    refresh: noop,
    busy: false,
    error: null,
    clearError: noop,
    canBranchMessage: () => false,
    anchorRequest: null,
    consumeAnchor: noop
  }
}
