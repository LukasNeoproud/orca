---
name: update-from-upstream
description: Update this personal Orca fork from upstream while preserving customizations. Use when the user invokes update-from-upstream or asks to bring in upstream Orca changes.
---

# Update from upstream

`personal` contains accepted customizations. `main` tracks upstream. The personal fork is `LukasNeoproud/orca`; upstream is `stablyai/orca`. Check remote URLs before fetching; do not treat the personal `origin` as upstream.

1. Inspect branches, worktrees, and pending changes. Create `integrate/upstream-<date>` from `personal` in an available checkout. Never disturb another session or stash/discard unrelated edits.
2. Fetch upstream `main` using an existing matching remote, or directly from `https://github.com/stablyai/orca.git`. Record the fetched commit and merge it into the integration branch. Preserve personal customizations; ask about conflicts that require a product decision.
3. Follow AGENTS.md, review the combined changes, and run affected checks with `ORCA_BACKGROUND_LAUNCH=1`. Summarize notable upstream changes, conflict resolutions, and verification. Leave the branch ready for the user to try; the Raycast launcher uses its configured repo checkout, so do not switch that checkout behind another session.
4. Once the user approves integration, merge into a clean, available `personal` checkout. Preserve upstream ancestry: use a normal merge or fast-forward, never squash or rebase accepted history. If `personal` advanced, incorporate it and recheck first.

Do not require tickets or PRs. Do not push, delete branches, or move local `main` unless requested. If upstream is already an ancestor of `personal`, report that no update is needed.
