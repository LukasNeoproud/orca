---
id: TASK-151
title: 'Brány kvality: nastavení bran a smyčky pro repozitář na vzdáleném hostiteli'
status: Done
assignee: []
created_date: '2026-11-20T13:05:00Z'
updated_date: '2026-11-24T07:49:00Z'
labels:
  - review-ide
  - effort-high
milestone: m-2
dependencies:
  - TASK-139
documentation:
  - docs/review-ide/06-ai-a-review.md
priority: high
type: feature
ordinal: 207650
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
### Cíl

TASK-139 zjistil, že brány ani smyčku nejde z desktopu nastavit pro repozitář na vzdáleném hostiteli: repos:update píše jen místní úložiště a runtime rozhraní pole nezná. Uživatel tak u SSH worktree brány nezapne.

### Výchozí body

- Nejdřív ověř zjištění v kódu (src/main/quality-gates, repos:update, runtime RPC) a zapiš do poznámek, kde se definice čtou při běhu na vzdáleném hostiteli.
- Šablona orcad pro linux-arm64 je v ~/.cache/orca-review-ide/task-139.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Uživatel v nastavení repozitáře, jehož worktree běží na vzdáleném hostiteli (SSH, vzdálený runtime), nastaví brány a zapne smyčku; definice se uloží tam, kde je čte hostitel, který brány spouští
- [x] #2 Definice dál zapisuje jen okno aplikace na pokyn uživatele, ne agent ani CLI (decision-11)
- [x] #3 Starší klient i starší hostitel: nové pole je volitelné a vyjednané schopností; testy kompatibility oběma směry
- [x] #4 Průchod ověřen proti hostiteli v kontejneru se smyšleným agentem: brána selže, smyčka doručí zprávu, stav vlastní vzdálený hostitel
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worker 2026-11-20, ověření výchozích bodů: definice čte hostitel při každém volání v resolveQualityGateTarget (src/main/quality-gates/quality-gate-target.ts) z vlastního řádku repozitáře (runtime.listRepos → qualityGates, qualityGateFeedbackLoop); u orcad je to jeho úložiště na vzdáleném stroji. Okno píše jen kanálem repos:update do místního úložiště; schéma repo.update pole zahazuje, takže u repozitáře hostitele runtime:<env> se nic neuloží a oddíl je proto jen ke čtení (editable = místní hostitel). Hostitel ssh:<target> brány nespouští vůbec (SshHostNotServedError), tam zůstává jen čtení.
Plán: (1) hostitel: metoda qualityGates.setRepositorySettings (repo, gates?, feedbackLoop?) za schopností quality-gates.repository-settings.v1, oprávnění settings-write; píše jen volající desktop nebo paired-device (ne runtime socket, ne telefon, ne nepojmenovaný) a jen do repozitáře, který hostitel sám vede; zápis přes runtime.updateRepo, normalizace stejná jako u repos:update. (2) klient: quality-gate-client + stávající RepositoryQualityGatesSection a RepositoryQualityGateFeedbackLoopSettings dostanou zápis pro runtime hostitele, pokud má schopnost; jinak dosavadní čtení. (3) testy: RPC (kdo smí), kontrakt + katalog, kompatibilita oběma směry, klient, komponenta. (4) dokumentace a decision-11. (5) průchod v kontejneru se smyšleným agentem.

Stav (worker): hostitel a protokol hotové s testy (metoda qualityGates.setRepositorySettings, schopnost quality-gates.repository-settings.v1, zapisovač v src/main/quality-gates/quality-gate-repository-settings.ts, katalog přegenerovaný, testy RPC + kontrakt + kompatibilita). Klient hotový s testy (quality-gate-client, hook use-repository-quality-gate-settings-writer, oddíl nastavení, 2 klíče v 6 jazycích). pnpm tc prochází. Zbývá: průchod v kontejneru se smyšleným agentem (AC4), snímek rozhraní, dokumentace a decision-11, brány (code-quality, anti-slop, ratchety).

Výsledek workera (2026-11-20): všechna čtyři kritéria splněná. Hostitel: qualityGates.setRepositorySettings za schopností quality-gates.repository-settings.v1, zapisuje jen volající desktop nebo paired-device s rozsahem runtime; runtime socket, telefon a nepojmenovaný volající odmítnuti. Klient: stávající oddíl nastavení a přepínač smyčky píší u hostitele runtime:<env> na hostitele, bez schopnosti zůstávají jen ke čtení. Průchod v kontejneru (orcad linux-arm64 v Dockeru přes SSH, smyšlený agent): brána selhala, zpráva doručena, oprava, prošlo; definice v /root/.orca/profiles/local-default/profile-state.db, běhy v /root/.orca/quality-gate-runs.json, v datech desktopu nic; přímé volání metody runtime socketem v kontejneru odmítnuto. Důkazy: ~/.cache/orca-review-ide/task-151 (out/timeline.log, out/shots, logs, specs/tmp-task-151-remote-gates.spec.ts, made-up-agent.py, runtime-socket-probe.js). Průchod v kontejneru běžel se sestavením před poslední úpravou hooku use-repository-quality-gate-settings-writer (rozdělení opakovaného dotazu na schopnost do dvou efektů kvůli bráně React Doctor); tu pokrývají jen jednotkové testy.

Otevřená otázka na uživatele (položena při zastavení koordinátora 2026-11-20): stačí důvěra ve spojení spárované aplikace, nebo stavět silnější důkaz, že definici zapsal člověk (potvrzení v okně na hostiteli, klíč vázaný na aplikaci)? Do odpovědi platí stav z tohoto tiketu.

Rozhodnutí uživatele 2026-11-24: decision-14 (telefon návrh nevyřizuje; agent smí navrhnout odebrání brány, TASK-164 a TASK-165; zápisu na dálku stačí spojení spárované aplikace).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Brány a smyčku repozitáře, který vede jiná Orca, jde nastavit z desktopové aplikace: nová metoda qualityGates.setRepositorySettings (schopnost quality-gates.repository-settings.v1) zapíše definice na hostitele, který brány spouští. Hostitel zápis přijme jen od okna aplikace nebo spárované desktopové aplikace podle identity z transportu; runtime socket (CLI, MCP, agent) a telefon odmítne. Starší hostitel bez schopnosti zůstává jen ke čtení. Ověřeno testy kompatibility oběma směry a průchodem smyčky se smyšleným agentem proti orcad v Dockeru přes SSH.
<!-- SECTION:FINAL_SUMMARY:END -->
