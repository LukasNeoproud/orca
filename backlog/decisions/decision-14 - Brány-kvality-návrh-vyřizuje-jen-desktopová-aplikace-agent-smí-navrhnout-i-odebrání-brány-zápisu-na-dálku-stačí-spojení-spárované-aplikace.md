---
id: decision-14
title: >-
  Brány kvality: návrh vyřizuje jen desktopová aplikace, agent smí navrhnout i
  odebrání brány, zápisu na dálku stačí spojení spárované aplikace
date: '2026-11-24T07:48:00Z'
status: accepted
---
## Context

Tikety TASK-148, TASK-149 a TASK-151 nechaly tři otázky na uživatele: kdo smí návrh bran od agenta vyřídit, jestli návrh smí bránu i odebrat a jestli hostiteli u zápisu bran na dálku stačí důvěra ve spojení spárované aplikace. Uživatel odpověděl 2026-11-24.

## Decision

- **Návrh bran vyřizuje jen desktopová aplikace** (okno na hostiteli nebo spárovaná desktopová aplikace). Telefon návrh nepřijme ani nezahodí; pravidlo pro zápis bran zůstává jedno (decision-11, oddíl Zápis na dálku).
- **Agent smí navrhnout i odebrání brány.** Uživatel to zvolil proti doporučení koordinátora. Odebrání je položka návrhu jako každá jiná: nic se neodebere, dokud ji uživatel v nastavení nepřijme.
- **Zápisu bran na dálku stačí spojení spárované aplikace.** Silnější důkaz, že zápis udělal člověk (potvrzení v okně na hostiteli, klíč vázaný na aplikaci), se nestaví.

## Consequences

- Návrh s odebráním potřebuje nový druh položky za novou schopností hostitele, změnu CLI a zobrazení „odebraná“ v nastavení: TASK-164 (hostitel, protokol, CLI) a TASK-165 (rozhraní). Kritérium #1 TASK-149 se tím splní celé.
- Rozhraní musí odebrání ukázat stejně zřetelně jako změnu, protože jím agent kontrolu své práce oslabuje.
- Meze důvěry ve spojení popsané v decision-11 platí dál: proces pod účtem uživatele, který si přečte přihlašovací údaj nebo data Orky, brány změnit umí.
