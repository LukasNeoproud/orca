---
id: TASK-133
title: >-
  Kontrakt Gitu: případ registrace repozitáře selhává na macOS kvůli /var a
  /private/var
status: Done
assignee: []
created_date: '2026-11-19T11:56:00Z'
updated_date: '2026-11-19T12:02:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-1
dependencies: []
type: bug
ordinal: 16100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Při TASK-109 selhal v `src/shared/git-binary-compatibility.test.ts` případ registrace repozitáře na macOS s jakoukoli verzí Gitu (i se systémovým 2.54). Test porovnává cesty přes `path.resolve` bez `realpath` a dočasný adresář `/var/...` je na macOS odkaz na `/private/var/...`. S `TMPDIR=/private/tmp/...` prochází.

### Rozsah

- Porovnání cest v testu; když se ukáže, že stejnou chybu má i produkční kód registrace, oprav ji tam a přidej test.

### Omezení

- Oprava nesmí změnit chování na Linuxu a Windows; cesty přes `path` a `fs.realpath`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 git-binary-compatibility.test.ts prochází na macOS s výchozím TMPDIR proti systémovému Gitu i proti Gitu 2.25 z ~/.cache/orca-review-ide
- [x] #2 Poznámky říkají, zda šlo jen o test, nebo i o produkční kód, a případná oprava kódu má vlastní test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán: příčina je v testu (Git vypíše --git-dir jako realpath, --git-common-dir relativně k cwd; path.resolve nad /var/... vs /private/var/...). Porovnat přes fs.realpath mimo Docker. Produkční repo-detection.ts už kanonizuje přes resolveRealPathSync (canonicalizeGitDirPath) – ověřit.

Hotovo. Šlo jen o test: Git vypíše --git-dir jako realpath (/private/var/...) a --git-common-dir relativně k cwd, takže path.resolve z cwd /var/... dalo jiný řetězec. Test teď mimo Docker porovnává fs.realpath(path.resolve(cwd, záznam)); v Dockeru beze změny posix.resolve. Produkční src/main/git/repo-detection.ts (mainRepoPathFromProbe) už obě cesty kanonizuje přes resolveRealPathSync (realpathSync.native), proto oprava kódu není potřeba; pokrývají to existující testy repo-detection-batching.test.ts (vnořená složka v tmpdir na macOS, mainRepoPath null), které prochází. Ověřeno: git-binary-compatibility.test.ts s výchozím TMPDIR proti /usr/bin/git 2.54.0 i Gitu 2.25.5 z ~/.cache/orca-review-ide, 31/31.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Šlo jen o test: Git vypisuje git dir jako skutečnou cestu a common dir relativně, takže path.resolve z /var na macOS dávalo jiný řetězec. Test mimo Docker porovnává přes fs.realpath; produkční kód už skutečné cesty používá. Kontrakt prochází 31/31 proti Gitu 2.54 i 2.25.5 s výchozím TMPDIR.
<!-- SECTION:FINAL_SUMMARY:END -->
