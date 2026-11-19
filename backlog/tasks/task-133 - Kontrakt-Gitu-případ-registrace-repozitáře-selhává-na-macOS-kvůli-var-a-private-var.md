---
id: TASK-133
title: >-
  Kontrakt Gitu: případ registrace repozitáře selhává na macOS kvůli /var a
  /private/var
status: To Do
assignee: []
created_date: '2026-11-19T11:56:00Z'
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
- [ ] #1 git-binary-compatibility.test.ts prochází na macOS s výchozím TMPDIR proti systémovému Gitu i proti Gitu 2.25 z ~/.cache/orca-review-ide
- [ ] #2 Poznámky říkají, zda šlo jen o test, nebo i o produkční kód, a případná oprava kódu má vlastní test
<!-- AC:END -->
