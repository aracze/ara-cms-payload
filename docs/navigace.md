# Navigace na webu — drobečky, sekundární menu a adresy

Popisuje pravidla, podle kterých web skládá **adresy stránek**, **drobečkovou navigaci**
a **sekundární menu**. Všechna tři témata visí na stejné věci — na hierarchii stránek
v CMS — proto jsou v jednom dokumentu.

## 1. Hierarchie a adresy (URL)

Stránky tvoří strom přes pole `parent` (plugin `@payloadcms/plugin-nested-docs`).
Z hierarchie plugin při každém uložení počítá dvě věci:

| Pole            | Význam                                                                             |
| --------------- | ---------------------------------------------------------------------------------- |
| `breadcrumbs[]` | celý řetězec předků od nejvyšší úrovně po stránku samotnou (`label`, `url`, `doc`) |
| `fullSlug`      | adresa stránky = `url` posledního drobečku                                         |

### Zaškrtávátko „Zobrazit v URL" (`includeInChildUrlPaths`)

Vypnuté znamená: **tato stránka se vynechá z adres míst pod ní** — a tím i ze všeho,
co je pod těmi místy. **Neplatí** pro její vlastní informační podstránky.

„Místem" jsou pro tohle pravidlo kategorie **Místo k navštívení** a **Místa**.
Turistický cíl místo NENÍ (drží si předka v adrese) a informační podstránky
(Počasí, Doprava, Měna a ceny, Vstupní podmínky, Zdraví a bezpečí, Jazyk a kultura,
Jídlo a pití, Ubytování, Cesta, Praktické informace) taky ne.

Příklad — Wyoming má „Zobrazit v URL" vypnuté:

| Stránka                                  | Kategorie          | Adresa                                             |
| ---------------------------------------- | ------------------ | -------------------------------------------------- |
| Wyoming                                  | Místo k navštívení | `/usa/wyoming`                                     |
| Počasí (pod Wyomingem)                   | Počasí             | `/usa/wyoming/pocasi` — počasí není místo          |
| Devils Tower (pod Wyomingem)             | Turistický cíl     | `/usa/wyoming/devils-tower` — cíl není místo       |
| Národní Park Yellowstone (pod Wyomingem) | Místo k navštívení | `/usa/narodni-park-yellowstone` — Wyoming vypadne  |
| Jezero Yellowstone (pod Yellowstonem)    | Turistický cíl     | `/usa/narodni-park-yellowstone/jezero-yellowstone` |

Pravidlo je v `buildPageUrl` (`src/lib/page-url.ts`) a používá ho jak CMS při ukládání
(`generateURL` v `src/payload.config.ts`), tak opravný skript.

> **Po změně pravidla spusť přepočet.** Payload adresy přepočítává jen při uložení
> dokumentu, takže staré stránky si drží staré adresy:
>
> ```bash
> pnpm fix:page-urls -- --dry-run   # jen vypíše, co by se změnilo
> pnpm fix:page-urls               # ostrý běh
> ```
>
> Skript je idempotentní. Na produkci se musí spustit zvlášť (má vlastní databázi).

## 2. Drobečková navigace

Kreslí se jako bílá „pilulka" nad titulkem v hero sekci
(`src/components/layout/page/hero-section.tsx`).

**Zdrojem je hierarchie v CMS (pole `breadcrumbs`), NE adresa.** Skládání z URL by
vynechalo stránky, které v adrese nejsou (Kalifornie, Wyoming), a stálo by jeden
databázový dotaz na každý úsek cesty.

Pravidla:

1. Řetězec **začíná zemí** — nejvyšší úroveň (kontinent, rubrika) se vynechává.
2. Řetězec **končí přímým rodičem** — aktuální stránka v drobečcích není, je v `<h1>`.
3. **Článek** se chová jako turistický cíl: jeho řetězec končí **místem, pod kterým visí**
   (parametr `includeSelf`). Místo bere z kontextu v URL, jinak z `mainPage`.
4. Když stránce chybí uložený řetězec (starý import, který ještě neprošel uložením),
   spadne výpočet na odvození z adresy (`breadcrumbsFromSlug`), aby drobečky ani
   strukturovaná data úplně nezmizely. Platí pro stránky **i články** — u článku se
   na konec doplní místo, pod kterým visí. Skryté stránky v takovém řetězci chybí
   (z adresy je dopočítat nelze), proto je to jen pojistka.
5. `includeInChildUrlPaths` na drobečky **nemá vliv** — skryté stránky v nich zůstávají
   (a jsou klikatelné, protože svou vlastní adresu mají).

Příklady:

| Stránka                                    | Drobečky                             |
| ------------------------------------------ | ------------------------------------ |
| `/usa`                                     | (žádné — nad USA je jen kontinent)   |
| `/usa/san-francisco`                       | USA / Kalifornie                     |
| `/usa/san-francisco/alcatraz` (cíl)        | USA / Kalifornie / San Francisco     |
| `/usa/san-francisco/pocasi`                | USA / Kalifornie / San Francisco     |
| článek pod San Franciscem                  | USA / Kalifornie / San Francisco     |
| článek pod rubrikou (`/rady-na-cestu/...`) | (žádné — rubrika je nejvyšší úroveň) |

Vykreslení a přístupnost:

- `<nav aria-label="Drobečková navigace">` → `<ol>` → `<li>`, oddělovač `/` je `aria-hidden`.
- **Všechny položky jsou odkazy** a žádná nemá `aria-current="page"` — v řetězci není
  aktuální stránka, jen její předci. Poslední (přímý rodič) je jen tučně zvýrazněný.
- Dlouhý řetězec přetéká **jen uvnitř pilulky** (skrytý posuvník), nikdy netlačí stránku
  do vodorovného posuvu.

Pro vyhledávače se ke drobečkům vypisují strukturovaná data
`schema.org/BreadcrumbList` (`breadcrumbListJsonLd`) — tam se jako **poslední položka
přidává i aktuální stránka**, protože Google očekává úplnou cestu.

## 3. Sekundární menu

Vodorovná lišta pod hero sekcí (`src/components/layout/page/subnavigation.tsx`).
Drží uživatele v kontextu **místa** — ne aktuální podstránky.

### Kdo menu „vlastní"

Vlastníkem může být jen kategorie **Místa** nebo **Místo k navštívení**
(`menuOwnerCategories` v `src/lib/page-hierarchy.ts`). Turistický cíl ani článek menu
nevlastní — vždy delegují na nadřazené místo.

Výběr kontextu (`fetchMenuContext`):

1. Je aktuální stránka místo? → kontextem je **ona sama**.
2. Jinak se hledá **nejbližší místo nad ní** (odspodu nahoru).
3. Když se žádné nenajde, použije se kořenová stránka.
4. `isSubPlace` = kontextové místo má nad sebou ještě jiné místo (např. Dubrovník
   pod Chorvatskem). Ovlivňuje sbalení praktických informací (viz níže).

Na **článku** je kontextem místo, pod kterým článek visí (stejně jako u cíle) —
včetně jeho podstránek a počtu článků.

Menu se **nezobrazuje** na kategoriích **Rubrika** a **Statická stránka**.

### Kontextové místo řídí i titulek a hero fotku

Podstránka se vždy týká **nejbližšího** místa, do kterého je vložená — počasí pod
Košicemi je počasí Košic, ne Slovenska. Ze stejného kontextového místa proto vychází:

- **titulek `<h1>`** — `buildPageTitle` skloňuje název kontextového místa přes pole
  `detail.genitive` / `detail.locative` (např. „Aktuální počasí a kdy jet **do Košic**",
  „Ubytování **ve Wyomingu**"). Když pole chybí, použije se nouzové `do <název>` /
  `v <název>`, což u řady jmen gramaticky nesedí.
- **fotka v hero sekci** — bere se z kontextového místa; když žádnou nemá, spadne to
  na kořenovou zemi, ať hero nezůstane prázdné.

Měna a časové pásmo se tímto neřídí — box „Aktuální informace" se vykresluje jen na
stránkách typu místo/cíl, kde je kontextovým místem stránka sama.

### Skloňování názvů (proč je v databázi, a ne v kódu)

Součástí hodnoty je i **předložka** — a tu z názvu nespočítá žádný algoritmus:
„**na** Slovensko", ale „**do** Chorvatska". K tomu vzorové skloňovače pletou množná
jména měst („do Košic", „v Košicích"). Starý web měl v prohlížeči vlastní skloňovač podle
vzorů, a i tak si držel uložené tvary a používal je jako první — pole je tedy zdroj pravdy
a v administraci se dá kdykoli přepsat.

Hromadné doplnění dělá seed + skript, ne ruční práce v adminu:

Tvary ~80 míst doplnil jednorázový doběh z ručně sestaveného seznamu
(`scripts/fix-declension.ts` + `scripts/data/place-declension.json`); oboje je
**odstraněné** a najdeš to v git historii. Doplňoval jen prázdná pole a kontroloval `title`,
aby po přejmenování stránky nepřepsal cizí záznam.

**U nových míst vyplň oba tvary v adminu** (`detail.genitive`, `detail.locative`) — bez nich
se titulky podstránek skládají z názvu v prvním pádě („Ubytování Kodaň" místo
„Ubytování v Kodani").

### Co je v menu (v tomto pořadí)

1. **Název kontextového místa** (odkaz na jeho stránku).
2. **Místa** — kotva na sekci „Co vidět a zažít" na stránce místa; jen když místo má děti.
3. **Podstránky místa** v legacy pořadí (Místa, Vstupní podmínky, Cesta, Počasí, Doprava,
   Měna a ceny, Zdraví a bezpečí, Jazyk a kultura, Jídlo a pití, Články, Praktické
   informace, Ubytování). Skrývají se: Místo k navštívení, Turistický cíl, Praktické
   informace a Články (ty mají vlastní kotvu).
4. **Praktické informace** — jediný sbalený odkaz; jen na podmístech, která nemají vlastní
   stránku praktických informací. Bere se z nejbližšího předka, který ji má.
5. **Články** — kotva na sekci článků; jen když kontextové místo nějaké články má.

### Zvýraznění

- Aktuální podstránka (nebo cokoli pod ní) je zvýrazněná a má `aria-current="page"`.
- Na stránce **místa** je zvýrazněný jeho název.
- Na stránce **článku** je zvýrazněná položka **Články**.
- Na stránce **turistického cíle** se nezvýrazňuje nic (parita se starým webem).
- Odkazy „Místa"/„Články" míří na kotvu (`#mista`, `#clanky`) na stránce kontextového
  místa — z podstránky tedy nejdřív přejdou na místo a pak sjedou na sekci.

## 4. Kde to je v kódu

| Soubor                                         | Co řeší                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/lib/page-url.ts`                          | pravidlo pro skládání adres (`buildPageUrl`)                       |
| `src/lib/page-hierarchy.ts`                    | drobečky z hierarchie, JSON-LD, `menuOwnerCategories`              |
| `src/lib/page-ancestors.ts`                    | předci z adresy — menu kontext a pojistka drobečků                 |
| `src/payload.config.ts`                        | zapojení pluginu nested-docs (`generateURL`)                       |
| `src/collections/Pages.ts`                     | pole `parent`, `fullSlug`, `includeInChildUrlPaths`, `breadcrumbs` |
| `src/components/layout/page/page.tsx`          | drobečky a kontext menu pro stránky                                |
| `src/components/layout/article/article.tsx`    | drobečky a kontext menu pro články                                 |
| `src/components/layout/page/hero-section.tsx`  | vykreslení drobečků                                                |
| `src/components/layout/page/subnavigation.tsx` | vykreslení sekundárního menu                                       |
| `src/lib/page-ancestors.ts`                    | dohledání předků (drobečky, kontext menu)                          |
| `src/lib/page-title.ts`                        | skládání titulků podstránek z pádů kontextového místa              |

## 5. Známé odchylky od starého webu

- **Skloňování je doplněné jen tam, kde ovlivňuje titulky.** Seed pokrývá 79 míst
  (145 hodnot) — všechna, která mají informační podstránky, plus opravu dvou špatných
  pádů převzatých z legacy („ve Wyoming", „ve Spojených států amerických"). U zbylých
  míst chybí lokál dál (~345), ale gramatiku nekazí: nadpisy pruhů mají čistý fallback
  („Co dalšího vidět" bez názvu místa). Doplnit se dá kdykoli rozšířením seedu.
- **Místa pod místy si mezistupeň drží.** Legacy dávalo každé místo přímo pod zemi
  (`/usa/north-rim`), nový web zachovává `/usa/grand-canyon/north-rim`. Vědomé
  rozhodnutí — nový tvar je popisnější a nemění se.
