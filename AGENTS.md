# Payload CMS Development Rules

> Tento soubor drží **jen pravidla specifická pro tento projekt**. Obecnou Payload
> příručku (kolekce, pole, hooky, práva, dotazy, komponenty…) dodává nainstalovaný
> oficiální skill `payload` + soubory v `.cursor/rules/` — proto ji zde neduplikujeme.

## ⚠️ Workflow — commit & deploy (ZÁVAZNÉ pro AI agenty)

1. **Před každým commitem se vždy zeptej uživatele** — nikdy necommituj bez jeho výslovného souhlasu.
2. **Před každým pushem se vždy zeptej** — platí pro `main` i pro jakoukoliv jinou větev. Pozor: push do `main` spouští automatické nasazení na produkci (GitHub Actions → ghcr.io → server).
3. **Před commitem vždy proveď code review změn a sepiš ho do chatu**: co se mění a proč, seznam dotčených souborů, rizika/dopady, jak bylo ověřeno (testy, lokální build/běh). Commit proveď až po odsouhlasení.

## ⚠️ Cache — závazná pravidla (dev vs. produkce)

1. **V dev režimu (`pnpm dev`) NESMÍ být aktivní žádná cache CMS dat** — žádné
   `unstable_cache`, ISR ani full route cache. Obsah upravený v adminu se musí na
   webu projevit okamžitě a měření výkonu musí ukazovat skutečné (necachované) časy.
2. Každé cachované čtení CMS dat MUSÍ jít přes helper `cached()` v `src/lib/payload.ts`
   (v dev vrací funkci bez cache obalu). Nikdy nevolej `unstable_cache` přímo
   z jiného místa. Jediná výjimka je vyhledávací index (`src/lib/search.ts` +
   `src/lib/search-cache.ts`): drží se v paměti procesu, protože Next položky nad
   2 MB do datové cache TIŠE neuloží (jen warn v logu) — pozor na to u každého
   dalšího velkého `cached()` čtení. I tato cache je jen v produkci.
3. Povolené výjimky v dev: React `cache()` (jen dedup dotazů v rámci JEDNOHO requestu,
   nic nedrží mezi requesty) a cache externích API mimo CMS (kurzy měn, počasí —
   chrání rate limity třetích stran).
4. Produkce: `unstable_cache` s tagy + okamžitá invalidace přes hooky
   v `src/hooks/revalidation.ts` (`revalidateTag(tag, { expire: 0 })` při publikaci
   v adminu — `updateTag` lze volat jen ze Server Action, z Payload hooku v route
   handleru vyhazuje chybu, takže by se invalidace tiše ztratila).

## 🧠 Nainstalované AI skilly (ZÁVAZNÉ – primární zdroj obecných znalostí)

**ZÁVAZNÉ:** Před psaním nebo úpravou kódu VŽDY zkonzultuj relevantní skill podle oblasti:
Payload/CMS (kolekce, pole, hooky, práva, dotazy) → **`payload`**; frontend a výkon
React/Next.js → **`vercel-react-best-practices`**; kontrola UI/přístupnosti → **`web-design-guidelines`**;
migrace obsahu → **`cms-migration`**. Projektová pravidla v tomto souboru mají přednost
před obecnými radami skillu, když se rozcházejí.

Skilly jsou v `.claude/skills/` (v repu) i globálně v `~/.claude/skills/` (dostupné z jakékoli
složky). Obsahují aktuální, upstream udržované znalosti, takže je není nutné sem duplikovat:

- **`payload`** (payloadcms/skills) — kolekce, pole, hooky, přístupová práva, dotazy,
  uploady, drafty, live preview, DB adaptéry, REST/GraphQL/Local API. Aktivuje se při
  práci s Payloadem (`payload.config.ts`, kolekce, hooky, přístupová práva).
- **`cms-migration`** (payloadcms/skills) — návrh kolekcí při migraci obsahu z jiného CMS.
- **`vercel-react-best-practices`** (Vercel) — výkon a vzory React / Next.js (App Router,
  Server/Client komponenty, data fetching, bundle). Pro **frontend půlku** appu.
- **`web-design-guidelines`** (Vercel) — kontrola UI: přístupnost (a11y), UX, výkon.

Hlubší kontext k Payloadu je i v `.cursor/rules/` (viz „Additional Context Files" níže).
Aktualizace skillů: `npx skills add payloadcms/skills -a claude-code --copy -y`
(a obdobně `npx skills add vercel-labs/agent-skills -a claude-code -s <skill> --copy -y`).

## 🌐 Frontend (Next.js) — projektová pravidla

Frontend i admin běží v **jednom** Next.js appu (`src/app/(frontend)` + `src/app/(payload)`).
Obecné vzory Next.js/React řeší skill `vercel-react-best-practices`; níže jsou jen pravidla
specifická pro tento web:

1. **TypeScript-first**: preferuj enumy (např. `PageCategory`) před volnými řetězci.
2. **Typy pro frontend**: frontend importuje kurátorované typy z `@/types/payload`
   (`src/types/payload.ts`), NE přímo z vygenerovaného `src/payload-types.ts`. Po změně
   schématu: `pnpm generate:types` → ručně dosyncuj nová/virtuální pole do
   `src/types/payload.ts`. (Po sloučení projektů se už nekopíruje mezi repy.)
3. **Sanitizace HTML/SVG**: před `dangerouslySetInnerHTML` VŽDY sanitizuj přes
   `isomorphic-dompurify` (funguje na SSR i CSR). Centrální místo převodu rich textu je
   `richTextToHtml` v `src/lib/utils.ts`; do whitelistu ponech nutné tagy (`iframe` pro
   mapy, `svg` pro ikony).
4. **Přístupnost (a11y)**: sémantické HTML; drobečky v `<nav>`/`<ol>`/`<li>`; aktivní
   stránka `aria-current="page"`; žádné `href="#"` — když odkaz není, renderuj statický
   `<span>`/`<div>`.
5. **Drobečky/hierarchie**: parent hierarchii řeš helperem `fetchAncestorChain`. Když
   parent v CMS chybí, nevyhazuj ho — vytvoř placeholder ze slugu, ať se zachová trail.
6. **Autoři**: zobrazuj přes virtuální pole `createdByPublic`; komponenta
   `CollapsiblePageTextWithContributor` (Places/Cities/Targets). Pro české skloňování
   dynamických titulků použij pole `genitive`.
7. **Lokální čas/timery**: `setInterval` pro hodiny zarovnej na celou minutu úvodním
   `setTimeout` (jinak hodiny „ujíždí"). Loading placeholdery drž ve stejných výškách/třídách
   jako finální obsah (prevence CLS). Neznámý offset vracej `null`, ne `0`.
8. **Vizuál / legacy parita**: při migraci z Grails miř na pixel-perfect (mezery, svislé
   linky, watermark ikony). Zkrácené svislé oddělovače řeš absolutním pozicováním
   (`top-[20%] h-[70%]`), ne borderem přes celou výšku.

## Core Principles (projektový checklist)

1. **TypeScript-First**: Always use TypeScript with proper types from Payload.
2. **Security-Critical**: Follow all security patterns, especially access control.
3. **Type Generation**: Run `pnpm generate:types` after schema changes (including virtual fields).
4. **Transaction Safety**: Always pass `req` to nested operations in hooks.
5. **Access Control**: Understand Local API bypasses access control by default.
6. **Consistent Formatting**: Always run `pnpm exec prettier --write <file>` after changing any files.
7. **Frontend Rules**: Frontend i admin jsou v tomto jednom appu — viz sekce „🌐 Frontend (Next.js) — projektová pravidla“ výše.
8. **Updated README**: Keep README.md up-to-date with new features.

### Code Validation

- To validate typescript correctness after modifying code run `tsc --noEmit`
- Generate import maps after creating or modifying components (`payload generate:importmap`).
- Always run `npm run format` after changing any files.

## Project Structure

```
src/
├── app/
│   ├── (frontend)/          # Frontend routes (veřejný web)
│   └── (payload)/           # Payload admin routes
├── collections/             # Collection configs
├── globals/                 # Global configs
├── components/              # Custom React components
├── hooks/                   # Hook functions (vč. revalidation.ts)
├── access/                  # Access control functions
├── lib/                     # Sdílené helpery (payload.ts, utils.ts, search.ts)
├── types/                   # Kurátorované typy pro frontend (payload.ts)
└── payload.config.ts        # Main config
```

## Data Transformation & Virtual Fields (projektová konvence)

### 1. Virtual Fields Pattern

For data that is derived or needs sanitization for the frontend (e.g., public author data, calculated URLs), use **Virtual Fields** instead of collection-level hooks.

- **Definition**: Set `virtual: true` on the field.
- **Hook**: Use the field-level `hooks.afterRead` to populate data.
- **Privacy**: Use this pattern to explicitly pick safe fields from related collections (e.g., `createdByPublic`).
- **Example**:
  ```typescript
  {
    name: 'someVirtualField',
    type: 'json',
    virtual: true,
    hooks: {
      afterRead: [async ({ data, req }) => { /* resolution logic */ }]
    },
    admin: { hidden: true }
  }
  ```

### 2. Anonymization

Never expose raw internal user data or relationship objects with deep population directly to the frontend. Always transform them into a "Public" equivalent via virtual fields.

## ⚠️ Kritické Payload vzory (rychlá připomínka)

Detailně je řeší skill `payload` a `.cursor/rules/security-critical`. Nikdy nezapomeň:

- **Local API**: při předání `user` VŽDY nastav `overrideAccess: false` — jinak operace běží s admin právy.
- **Hooky**: VŽDY předávej `req` do vnořených operací (jinak se rozbije atomicita transakce).
- **Hooky**: chraň se před nekonečnou smyčkou přes `context` flag (`context: { skipHooks: true }`).
- **Field-level access**: vrací jen boolean, ne query constraint (to umí jen collection-level).
- **Typy**: po změně schématu `pnpm generate:types`; po změně komponent `payload generate:importmap`.

## Additional Context Files (`.cursor/rules/`)

Hlubší kontext k jednotlivým tématům (kdyby skill nestačil):

1. `payload-overview.md` — architektura a základní koncepty
2. `security-critical.mdc` — ⚠️ kritické bezpečnostní vzory (Local API, transakce, smyčky)
3. `collections.md` — konfigurace kolekcí (vč. auth/RBAC, uploads, drafts, globals)
4. `fields.md` — typy polí a vzory (conditional, virtual, validace)
5. `field-type-guards.md` — TypeScript utility pro typy polí
6. `access-control.md` — collection/field-level, row-level security, RBAC
7. `access-control-advanced.md` — složité vzory (nested, cross-collection, hierarchie rolí)
8. `hooks.md` — lifecycle hooky (collection/field, context, recepty)
9. `queries.md` — Local API, operátory, AND/OR, výkon
10. `endpoints.md` — vlastní REST endpointy (auth, error handling, route params)
11. `adapters.md` — DB a storage adaptéry (Postgres/Mongo/SQLite, S3/Cloudinary…)
12. `plugin-development.md` — tvorba pluginů
13. `components.md` — vlastní admin komponenty (Server vs Client, cesty, styling)

## Resources

- Docs: https://payloadcms.com/docs
- LLM Context: https://payloadcms.com/llms-full.txt
- GitHub: https://github.com/payloadcms/payload
- Examples: https://github.com/payloadcms/payload/tree/main/examples
- Templates: https://github.com/payloadcms/payload/tree/main/templates
