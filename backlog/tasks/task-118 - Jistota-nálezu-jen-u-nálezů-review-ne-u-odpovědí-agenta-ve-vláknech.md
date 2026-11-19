---
id: TASK-118
title: Jistota nálezu jen u nálezů review, ne u odpovědí agenta ve vláknech
status: Done
assignee: []
created_date: '2026-11-19T04:10:00Z'
updated_date: '2026-11-19T04:27:00Z'
labels:
  - review-ide
  - effort-medium
  - model-opus
milestone: m-2
dependencies: []
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: medium
type: bug
ordinal: 200600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

Po TASK-84 má jistotu každý nepublikovaný draft agenta. Odpovědi agenta na komentáře vznikají v toku, kde po něm důkaz nikdo nechce, takže jsou všechny označené jako nejisté a značka ztrácí váhu u skutečných nálezů.

### Rozsah

- `src/main/azure-devops/review/azure-devops-review-draft-findings.ts` (kde se jistota odvozuje) a zobrazení v `src/renderer/src/components/azure-devops-review/`.
- Vyvrácená citace musí zůstat vidět i u odpovědi: je to chyba agenta, ne chybějící důkaz.

### Mimo rozsah

- Žádat důkazy i v promptech pro odpovědi a přepracování draftu (pozdější tiket).
- Zobrazení v mobilní aplikaci.

### Omezení

- Jen nepovinná pole; nic nepřejmenovávej.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Draft odpovědi agenta ve vlákně neukazuje na kartě ani v diffu značku jistoty; draft nálezu z AI review ji ukazuje jako dosud
- [x] #2 Odpověď, ke které agent důkaz přiložil, ukazuje jeho kontrolu v seznamu důkazů a vyvrácená citace je vidět i u odpovědi
- [x] #3 Rozhodnutí dělá jedno pravidlo ve sdíleném nebo hostitelském kódu s testem; desktop, CLI a MCP ho čtou ze stejné odpovědi
- [x] #4 Starší klient dostane platnou odpověď; decision-10 a docs/review-ide/06-ai-a-review.md uvádějí pravidlo
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plán (worker):
- Zjištění: odpověď se pozná podle kind === 'reply' (při vytvoření povinné threadId, kind se úpravou nemění). Prompt AI review ale výslovně dovoluje nálezy i jako odpovědi do existujících vláken ("or replies to existing threads", se severity a evidence), takže samotný druh draftu by nálezy z AI review propustil.
- Pravidlo: draft agenta je nález, pokud není odpovědí, nebo pokud odpověď nese závažnost (prompt AI review ji žádá u každého nálezu, prompt odpovědí na komentáře ji nezmiňuje). Odpověď bez závažnosti dostane jistotu jen 'contradicted', když ji vyvrací vlastní důkaz; jinak se certainty vynechá. Kontroly důkazů (evidenceChecks) se počítají dál pro všechny drafty.
- Kód: čistá funkce v hostiteli vedle describeAzureDevOpsReviewDraftFindings, test; popis severity v nástrojích agenta doplnit o to, že odpověď bez závažnosti není nález.
- Rozhraní beze změny (karta i diff čtou certainty z odpovědi hostitele); e2e: draft odpovědi bez důkazu a s vyvrácenou citací.
- decision-10 a 06-ai-a-review.md doplnit.

Hotovo (worker):
- Pravidlo: azureDevOpsReviewDraftCertainty v src/main/azure-devops/review/azure-devops-review-draft-certainty.ts (+ test), volá ho describeAzureDevOpsReviewDraftFindings. Odpověď (kind reply) bez závažnosti: certainty vynechaná, kromě 'contradicted' při vyvráceném důkazu. Odpověď se závažností a každý jiný draft agenta: beze změny.
- Rozhodnutí o vyvrácené citaci u odpovědi: hostitel pošle existující hodnotu 'contradicted' (žádná nová hodnota), takže ji ukáže karta, diff, CLI, MCP i starší klient; seznam důkazů se otevře sám.
- Popis --severity v CLI a severity v nástrojích agenta: odpověď bez závažnosti není nález. Renderer beze změny, RPC parametry beze změny.
- e2e: druhý test v tests/e2e/pull-request-draft-findings.spec.ts (odpovědi bez důkazu, s potvrzenou a vyvrácenou citací, odpověď se závažností), snímky ~/.cache/orca-review-ide/task-118.
- decision-10 a docs/review-ide/06-ai-a-review.md doplněné.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Značka jistoty zůstává jen u nálezů. Draft agenta je nález, když není odpovědí ve vlákně, nebo když odpověď nese závažnost (AI review smí nálezy psát i jako odpovědi a závažnost žádá u každého). Odpověď bez závažnosti jistotu nemá a pole se vynechá; výjimkou je odpověď s vyvrácenou citací, která se ukáže jako vyvrácená na kartě i v diffu, v CLI i MCP, se skutečným kódem bez kliknutí. Kontroly důkazů se počítají u všech draftů jako dřív a pravidla odvození jistoty se nezměnila. Popisy nástrojů agenta a nápověda CLI říkají, že odpověď, která jen odpovídá na vlákno, závažnost nemá. Parametry RPC, renderer ani lokalizace se nezměnily; starší klient ukáže odpověď bez značky. Mez zapsaná v decision-10: odpověď z AI review, u které agent závažnost vynechá, se ukáže bez značky. Ověřeno testem pravidla přes všechny kombinace, testem hostitele a e2e ve skrytém okně; skutečný agent se nespouštěl, takže není doloženo, že v toku odpovědí závažnost opravdu nenastavuje. Zpracoval worker na Opusu 5.5.
<!-- SECTION:FINAL_SUMMARY:END -->
