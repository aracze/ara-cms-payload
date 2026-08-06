# Payload Project (ara.cz)

## Quick Start - local setup

To spin up this project locally, follow these steps:

### Development

1. **Clone the repo** (if you have not done so already).
2. **Environment Variables**: `cp .env.example .env` to copy the example environment variables.
   - Make sure `DATABASE_URL` in `.env` matches your database setup.
   - For Docker, it should be: `DATABASE_URL=postgres://postgres:yourpassword@127.0.0.1:5432/aracze`
3. **Start Database**: Use Docker to run PostgreSQL (recommended):
   ```bash
   docker compose up -d postgres
   ```
4. **Install & Run**:
   ```bash
   pnpm install
   pnpm payload migrate
   pnpm dev
   ```
   > **Legacy data migration (optional)**: To import historical content from the old MySQL site, set the `OLD_DB_*` variables (`OLD_DB_HOST`, `OLD_DB_PORT`, `OLD_DB_USER`, `OLD_DB_PASSWORD`, `OLD_DB_NAME`) in `.env` and run the relevant script. The feather ledger is migrated with `pnpm migrate:transactions` — run it **after** `migrate:users`, `migrate:pages`, `migrate:articles`, and `migrate:comments`, since it links transactions to those records. Preview first with `pnpm migrate:transactions -- --dry-run` (or test a subset with `-- --limit=50`).
5. **Access Admin**: Open `http://localhost:3000/admin` to create your first admin user.
6. **Promote Admin (Required for DB dumps)**:
   ```bash
   pnpm run promote:admin -- user@example.com
   ```
7. **DB Dump (Admin Only)**:
   - In the Admin UI, use the **Download DB Dump** action.
   - Always uses `pg_dump` from the Postgres Docker service.
   - Ensure Postgres is running via `docker compose up -d postgres`.
   - Payload container must have Docker Compose available (`docker compose` or `docker-compose`) and `/var/run/docker.sock` mounted (already configured in `docker-compose.yml`).
   - If your Postgres is started via this repo's Compose file, no extra env vars are needed.
   - If your Postgres service name or host differs (edge case), set:
     - `PG_DUMP_DOCKER_SERVICE=postgres` (optional)
     - `PG_DUMP_DOCKER_HOST=localhost` (optional)
     - `PG_DUMP_DOCKER_CONTAINER=postgres-1` (optional, only if the service lookup fails)
8. **DB Import (Admin Only, Destructive)**:
   - In the Admin UI, use the **Import DB Dump** action.
   - Upload a `pg_dump` custom-format file (the same format downloaded by the dump action).
   - The import uses `pg_restore` with `--clean --if-exists` and overwrites all existing data.
   - Requires the same Docker Compose access as the dump action.

---

## Technical Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **CMS**: [Payload 3.0](https://payloadcms.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via Docker)
- **Adapter**: `@payloadcms/db-postgres`

---

## Docker Configuration

The project includes a `docker-compose.yml` pre-configured for PostgreSQL.

### Commands:

- **Start DB**: `docker compose up -d postgres`
- **Stop DB**: `docker compose stop postgres`
- **Full Reset (Warning: deletes data)**: `docker compose down -v`

---

## CI/CD

The project includes two GitHub Action workflows:

### CI (`.github/workflows/ci.yml`)

Runs on **every push** to any branch.

1.  **Lint**: Runs `pnpm run lint` for code quality.
2.  **Format Check**: Runs `npx prettier --check .` for code style.
3.  **Tests**: Runs integration and E2E tests using `pnpm run test` (uses a PostgreSQL service container).

### CD (`.github/workflows/cd.yml`)

Runs only on **push to the `main` branch**.

1.  **Docker Build**: Validates and builds the production Docker image.

## Production

### Docker image

To build and run the production-optimized Docker image:

1. **Build the image**:

   ```bash
   docker build -t payload-cms:latest .
   ```

2. **Run the container**:
   ```bash
   docker run -p 3000:3000 \
     --env-file .env \
     -e DATABASE_URL=postgres://postgres:yourpassword@host.docker.internal:5432/aracze \
     payload-cms:latest
   ```

### Command Explanations:

- `-p 3000:3000`: Maps the container's internal port 3000 to your host's port 3000.
- `--env-file .env`: Automatically loads all environment variables (secrets, keys, etc.) from your `.env` file.
- `-e DATABASE_URL=...`: Overrides the database connection string.
  - **Note**: On Mac or Windows, use `host.docker.internal` to allow the container to connect to a database running on your host machine.
- `payload-cms:latest`: Specifies the image to run.

> [!TIP]
> This image uses Next.js **Standalone Output**, meaning it is extremely lightweight and ready for production deployment. It does not require volume mounts for source code or `node_modules`.

### Ochrana e-mailu proti robotům — řeší Cloudflare, ne kód

**Na zóně `ara.cz` je Scrape Shield → Email Address Obfuscation už ZAPNUTÝ** (ověřeno 6. 8. 2026: `https://ara.cz/kontakt` nemá v HTML `mailto:` ani samotnou adresu, odkaz vede na
`/cdn-cgi/l/email-protection#<hex>`). Cloudflare přepisuje `mailto:` odkazy na hraně sítě
a rozkóduje je až vlastním JavaScriptem v prohlížeči, takže se adresa do zdroje stránky
vůbec nedostane. **Pro nový web to znamená, že není co dělat** — jakmile pojede na proxovaném
záznamu téže zóny (oranžový obláček v DNS), platí to samo pro patičku i pro adresy v rich
textu Reklamy a Podmínek.

Tři věci, které je dobré vědět:

- Testovací provoz jde na IP napřímo, mimo proxy, takže tam se nic nepřepisuje — to je
  očekávané, ne rozbité.
- Cloudflare přepisuje HTML **dokumenty**. Když návštěvník proklikává web (Next.js přechází
  na klientu), přijde text Reklamy a Podmínek jako RSC payload a adresa se v DOM objeví
  nezakódovaná. Pro účel „aby ji nesbírali roboti" to nevadí — harvestery si stahují
  dokumenty, neproklikávají SPA.
- Návštěvník s vypnutým JavaScriptem uvidí místo adresy `[email protected]`. To je cena
  Cloudflare řešení; kdo chce psát, musí mít JS.

**Proč to neřešíme v kódu:** adresa je kromě patičky i ve **rich textu** stránek Reklama
a Podmínky užívání webu (dvakrát na každé), takže by obfuskace musela zasáhnout
`richTextToHtml`, ne jen jednu komponentu. A všechny kódové triky mají cenu, kterou platí
lidé, ne roboti: starý web měl `mailto:infoATaraDOTcz` + `onclick`, který `AT`/`DOT`
přepisoval na znaky, a ve viditelném textu past `<span id="dummy">remove</span>`. Po
zkopírování z toho vyšlo `inforemove@ara.cz`, bez JavaScriptu odkaz nefungoval a čtečka
obrazovky přečetla i tu past — přitom `AT`/`DOT` obejde každý harvester, který si stránku
otevře v bezhlavém prohlížeči. Cloudflare dělá totéž bez těchto následků a na všech
stránkách naráz.

**Kdyby to nestačilo**, další úroveň není lepší obfuskace, ale kontaktní formulář — Turnstile,
rate limit a heuristika odkazů (`src/lib/comment-spam.ts`) i odesílání e-mailů přes SMTP
už v projektu jsou, takže by adresa nemusela být na webu vůbec.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Besides the database and
storage credentials, the following variables drive user-visible features:

| Variable                                                                                               | Required                   | Used for                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _(maps need no key)_                                                                                   | —                          | Maps use OpenStreetMap via MapLibre + OpenFreeMap tiles (no key, no limits); the branded style is generated by `node scripts/build-map-style.mjs` into `public/map-styles/aracze.json`.                                                                                                                      |
| `OPENWEATHER_API_KEY`                                                                                  | For weather                | Server-side key for the `/api/weather` endpoint (never exposed to the browser).                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_SITE_URL`                                                                                 | Recommended                | Public site URL for the sitemap and canonical links (default `https://www.ara.cz`).                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_PAYLOAD_BASE_URL`                                                                         | **Required in production** | Veřejná adresa webu: absolutní adresy obrázků, `serverURL` (kontrola původu požadavků) a odkazy v e-mailech. V produkci bez ní aplikace spadne — viz `publicBaseUrl()` v `src/lib/public-url.ts`; tichý fallback na localhost by znamenal, že odkazy v dopisech vedou na localhost a nikdo si toho nevšimne. |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2` | Optional                   | Google AdSense units in article listings.                                                                                                                                                                                                                                                                    |
| `TURNSTILE_SITE_KEY`                                                                                   | Optional                   | Cloudflare Turnstile site key for the article comment form (anti-spam).                                                                                                                                                                                                                                      |
| `TURNSTILE_SECRET_KEY`                                                                                 | Optional                   | Cloudflare Turnstile secret key (server-side token verification).                                                                                                                                                                                                                                            |

> `NEXT_PUBLIC_*` variables are inlined into the client bundle at build time and
> are therefore public. Keep secrets (e.g. `OPENWEATHER_API_KEY`, `PAYLOAD_SECRET`)
> **without** the `NEXT_PUBLIC_` prefix so they stay server-only.

> **Comment anti-spam (Cloudflare Turnstile).** Both `TURNSTILE_*` keys are read
> **server-side at runtime** — the site key is handed to the browser through a
> server component prop, so it is **not** `NEXT_PUBLIC_` and needs no rebuild. When
> both keys are set, the comment form shows a Turnstile widget and the server
> verifies the token. Turnstile is treated as an **all-or-nothing pair**: with
> only one key set (or neither), it stays disabled and the form falls back to an
> invisible honeypot + rate-limit + link heuristic (see `src/lib/comment-spam.ts`).
> This avoids the broken half-states (secret-only rejects every submission;
> site-only renders a widget with no server check). For production add **both**
> keys to the server's runtime `.env` (`/opt/aracze/.env`).

---

## API Endpoints

The app exposes a few JSON/utility routes under `/api` (in addition to Payload's
own REST/GraphQL API under `/api/[...slug]` and `/api/graphql`).

### `GET /api/health`

Liveness probe for containers / uptime checks. Returns `200` with an empty body
when the app is running (`503` on failure). No parameters.

```bash
curl -i http://localhost:3000/api/health
```

### `GET /api/search`

Full-text search over page titles and text. The index is built at runtime from
the Local API and cached with tags (see `src/lib/search.ts`); matching uses
[Fuse.js](https://fusejs.io/).

- Query param `q` — the search term (empty `q` returns no matches).
- Response: `{ "success": true, "message": [ /* Fuse results */ ] }`.

```bash
curl 'http://localhost:3000/api/search?q=chorvatsko'
```

### `PUT /api/weather`

Proxies the OpenWeather _One Call_ API for a given coordinate (keeps the API key
server-side). Requires `OPENWEATHER_API_KEY`.

- JSON body: `{ "lat": <number -90..90>, "lng": <number -180..180> }`.
- Returns the upstream OpenWeather JSON (metric units, `minutely`/`alerts`
  excluded). Responds `400` for invalid coordinates and `500` if the key is
  missing or the upstream call fails.

```bash
curl -X PUT http://localhost:3000/api/weather \
  -H 'Content-Type: application/json' \
  -d '{"lat": 45.81, "lng": 15.98}'
```

---

## How it works

The Payload config is tailored specifically for the project needs in `src/payload.config.ts`.

Pravidla navigace na webu (drobečky, sekundární menu, skládání adres z hierarchie stránek
přepočet adres přes `pnpm fix:page-urls` a skloňování názvů míst přes
`pnpm fix:declension`) jsou popsaná v [docs/navigace.md](docs/navigace.md).

### Collections

- **Users (Správa uživatelů)**:
  - Slouží k autentizaci a autorizaci přístupu do administrace.
  - Výchozím identifikátorem je e-mail.
  - Kolekce je připravena na rozšíření o role (např. admin, editor) a další uživatelské údaje.
  - V administraci lze spravovat hesla a přístupové údaje.
  - **Přihlášení na webu** (`/prihlaseni`, na webu se otevírá jako modál z papouščí ikony
    v hlavičce): stránka je základ (funguje i bez JavaScriptu, dá se poslat odkazem), modál je
    jen zkratka — obojí používá tentýž formulář. Token nese `httpOnly` cookie `payload-token`
    (platnost 7 dní = `tokenExpiration`; obě hodnoty MUSÍ souhlasit), po 5 neúspěšných pokusech
    Payload účet na 10 minut zamkne. Přihlášeného čte `getCurrentUser` (`src/lib/auth.ts`) —
    vrací jen bezpečnou podmnožinu polí (nikdy e-mail ani role) a **ptá se jen když existuje
    cookie**: `payload.auth()` totiž kromě tokenu dopočítává oprávnění všech kolekcí, což
    u anonymních návštěvníků spouštělo drahé pravidlo kolekce comments (~4 s na každou stránku).
  - **Registrace** (`/registrace`) vytváří účet přes `registerAction`
    (`src/lib/register-actions.ts`) s `overrideAccess: true`, protože kolekce má
    `create: isAdmin`. Proto si akce sama vynucuje: pevně `roles: ['user']` (NIKDY z formuláře),
    jen e-mail/heslo/uživatelské jméno, honeypot + rate limit + Turnstile jako u komentářů, a obsazený
    e-mail se ZÁMĚRNĚ nehlásí (jinak by formulář posloužil ke zjišťování registrovaných adres).
    Účet vzniká neověřený → Payload pošle potvrzovací e-mail s odkazem na
    `/registrace/potvrzeni?token=…`; bez potvrzení Payload přihlášení odmítne (ověřeno).
  - **Uživatelské jméno** je veřejná identita (adresa profilu + podpis u komentářů), takže si ji uživatel
    volí sám — odvozovat ji z e-mailu by veřejně vyzradilo jeho část. Pravidla jsou v
    `src/lib/username.ts` (3–30 znaků, jen `a-z0-9._-`, nesmí začínat/končit oddělovačem,
    seznam zakázaných slov). Nové uživatelská jména se ukládají MALÝMI písmeny a obsazenost se kontroluje
    bez ohledu na velikost (`like` = v Postgresu ILIKE + přesné srovnání v JS, protože Payload
    nemá „rovná se bez ohledu na velikost"). V databázi je na `username` unikátní index — ten je
    ale case-sensitive, takže je to jen pojistka proti souběžné registraci, ne hlavní kontrola.
    Migrované uživatelská jména s diakritikou a velkými písmeny („káťa", „TravelPortal.cz") zůstávají.
    Nastavení profilu proto NESMÍ být na `/profil/nastaveni` (kolidovalo by s uživatelským jménem) —
    patří mimo, na `/nastaveni`.
  - **Podpis pod veřejným obsahem = uživatelské jméno**, ne jméno a příjmení (`publicName`
    v `src/lib/auth.ts`). Důvod je datový: všech 229 podepsaných komentářů z legacy webu je
    uložených s uživatelským jménem, takže podpis celým jménem by u nových příspěvků vypadal
    jinak než u starých pod nimi. Celé jméno patří do záhlaví profilu. „Píšeš jako…" nad
    formulářem ukazuje PŘESNĚ ten podpis, který se pod příspěvkem objeví.
  - **Jméno je JEDNO pole** (`name`), ne dvojice jméno + příjmení. Nikde v aplikaci se ty dvě
    části nepoužívaly zvlášť (všech pět míst je zase slepilo dohromady) a jména se na dvě
    kolonky spolehlivě nedělí — dvě příjmení, mononyma, tituly, jinde ve světě příjmení první.
    Převod starých dat dělá `pnpm migrate:user-name` (25 účtů); pole `firstName`/`lastName`
    zůstávají dočasně skrytá a jen ke čtení, než se sloupce zahodí i v produkci.
  - **Úprava profilu probíhá na profilu** (`?upravit=1`), ne na samostatné stránce nastavení:
    člověk mění to, na co se dívá. Profil se přitom NEMĚNÍ na formulář — zůstává profilem
    a jen jeho části jdou přepsat na svém místě (fotka v hlavičce má překryv s fotoaparátem,
    jméno je pole v nadpisu, medailonek a web mají čárkovaný rámeček). Celou stránku obtáčí
    jeden `<form>` (`ProfileEditFrame`) a ukládá se z lišty přišpendlené dole. Tlačítko je skutečný odkaz, takže to funguje i bez
    JavaScriptu; ukládá se výslovně tlačítkem (automatické ukládání po opuštění políčka nedává
    jistotu, že se změna uložila, a hůř se z něj vzpamatovává při chybě). Zápis dělá
    `updateProfileAction` (`src/lib/profile-actions.ts`): identita VÝHRADNĚ ze session (z
    formuláře nechodí žádné ID účtu), `overrideAccess: false` (takže platí práva polí — `roles`
    smí měnit jen admin), do `data` jdou jmenovitě vypsaná pole.
  - **Vlastník vidí svůj profil vždy**, i když nemá žádný obsah — jinak by se nově registrovaný
    člověk na svůj profil nedostal a nemohl si ho vyplnit. Pro ostatní zůstává prázdný profil 404.
  - **`/nastaveni`** drží jen NEVEŘEJNÉ věci: přihlašovací e-mail (zatím jen ke čtení — změna
    potřebuje potvrzení z nové adresy, jinak by překlep odřízl obnovu hesla), změnu hesla
    a smazání účtu. Heslo se ověřuje `payload.login()` (Payload jinou cestu nenabízí) — pozor,
    neúspěch se počítá do limitu pokusů. Po změně hesla se vystaví NOVÁ cookie: token je
    bezstavový JWT, sám by platit nepřestal.
  - **Smazání účtu** příspěvky NEMAŽE, jen je odpojí od účtu (`author: null`, jméno se opíše do
    `authorName`) — komentář se pak chová jako od nepřihlášeného. Mazat je celé nejde, protože
    by z diskusí zmizely i odpovědi ostatních. Volitelně se jméno nahradí za „Smazaný uživatel"
    (GDPR: uživatelská jména typu „jakub.neuzil.5" jsou fakticky jméno). Účet maže
    `deleteAccountAction` s `overrideAccess: true` — nutné (mazat smí jinak jen admin)
    a bezpečné: totožnost je ověřená ze session A heslem, maže se výhradně `me.id`.

  - ⚠️ **Zapnutí `auth.verify` vyžaduje jednorázový `pnpm backfill:verified`** — označí stávající
    účty za ověřené. (Ověřeno, že Payload staré účty bez příznaku neblokoval, ale příznak má být
    explicitní; skript je idempotentní.)
  - **Veřejný profil** (`/profil/<username>`, stejná adresa jako legacy web): hero s vlnkou
    jako každá jiná stránka — výchozí **klidná mlhavá fotka** (konstanta `DEFAULT_COVER_URL`
    v `src/lib/default-cover.ts`; výměna = přepsání jedné Cloudinary adresy) s dvojím jemným
    ztmavením (do středu kvůli jménu + shora pod hlavičku webu, jinak
    bílé menu leželo na světlé obloze). Než se fotka načte, překryje pozadí **rozmazaný náhled
    téže fotky** (`DEFAULT_COVER_BLUR`, 20 × 13 px, ~340 B přímo v HTML, přes `placeholder="blur"`
    v `StaticHeroImage`) — proto při načítání neproblikne holá barva; po výměně fotky je nutné
    náhled přegenerovat (příkaz je v komentáři u konstanty). Pod ním zůstává `bg-[#3b444f]`
    jako u všech ostatních hlaviček. **Tutéž obálku dědí i statické stránky**, které v CMS
    nemají vlastní obrázek (jinak by v heru zůstal holý tmavý pruh).
  - Identitu v hlavičce drží **jeden blok na ose stránky**: avatar (84 px), pod ním jméno
    a `@username`. Když uživatel nemá vyplněné jméno a příjmení, je jméno = uživatelské jméno
    (např. „TravelPortal.cz") a místo `@username` se vykreslí **tenká linka** jako u titulků
    ostatních stránek, aby blok nekončil natvrdo.
    Blok scelují těsná odsazení a **plynulý tmavý „kužel"** — radiální gradient
    výrazně širší než obsah, který mizí do neurčita, takže nemá hranu čitelnou jako rámeček
    nebo tlačítko, a zároveň drží kontrast i při výměně fotky za světlejší. Naměřeno: jméno
    10,19 : 1, `@username` 10,80 : 1, menu webu 7,14 : 1 — WCAG AA. Kužel MUSÍ být oříznutý
    (`overflow-hidden` na bloku), jinak prosvítá pod vlnkou do bílé části jako šedá šmouha.
    Blok sedí na **optickém** středu, ne matematickém (`pb-2`): vlnka ukrajuje spodních ~70 px
    hlavičky, takže přesně vystředěný blok působí posazený nízko. Naměřeno: avatar začíná
    24 px pod textem menu webu (box hlavičky končí na 65 px, text menu na 46 px).
  - Cesta k tomuto řešení (ať se neopakují slepé uličky): nejdřív ve fotce stály čtyři úrovně
    nad sebou (avatar, jméno, linka, „@jméno · Cestovní průvodce") → přeplněné, role navíc
    stejná na všech profilech. Pak avatar sjel na vlnku a ve fotce zůstalo jen jméno → čisté,
    ale avatar odtržený od jména nedržel pohromadě. Průhledná „pilulka" kolem obojího se čte
    jako tlačítko. Následuje medailonek (popis „o mně" + odkaz na vlastní web) a **vše na jedné
    stránce**: statistiky fungují jako kotvy na sekce.
  - Pod statistikami je **mapa přes celou šířku okna** (360 px) se všemi místy a cíli autora,
    která mají v CMS souřadnice (`mapPins` z `fetchUserProfile` — bere je ze STEJNÝCH dat jako
    karty, žádný dotaz navíc, včetně náhledové fotky, aby mapa kreslila kulaté piny s fotkou
    a bublinu s náhledem jako na stránkách míst). Výřez si mapa dorámuje na všechny piny sama
    přes `fitToMarkers` (volitelný prop `MapLibreMap`, strop přiblížení `MAX_FIT_ZOOM`;
    stránky míst si střed a zoom dál volí samy) — `centerLat`/`centerLng`/`zoom` z profilu jsou
    jen výchozí stav pro první vykreslení (střed obálky bodů, ne průměr, který by hustá oblast
    přetáhla k sobě).
    ZÁMĚRNĚ jedna mapa pro celý profil, ne mapa u každé sekce jako u výpisů míst: body autora
    jsou po celém světě, takže mapa vedle mřížky by byla malá a nečitelná, ubrala by kartám
    sloupec a znamenala dvě instance mapy. Články na mapě nejsou — nemají vlastní
    souřadnice, jen souřadnice svého místa, takže by piny jen zdvojily. Pozn.: komponenta mapy
    neumí seskupování (clustering), takže u autorů se stovkami bodů je mapa hustá.
  - Pořadí sekcí: **Místa → Turistické cíle → Články → Recenze → Komentáře** (od nejobecnějšího
    přínosu k nejdrobnějšímu); statistiky nahoře mají stejný sled, takže kotvy vedou „dopředu".
  - Všech pět sekcí má **jeden vizuální jazyk**: vycentrovaný nadpis s červenou linkou
    a podtitulkem + mřížka karet 280 px, sekce se střídavě podkládají šedou. U nadpisu ZÁMĚRNĚ
    není počet (souhrn nad mapou ho už uvádí a působil tam jako přebytek) — kolik položek
    zbývá, říká až tlačítko pod mřížkou: „Zobrazit 26 dalších míst" (po 8; skloňování řeší
    `pluralCs` v `src/lib/utils.ts`, tvary se předávají přes `moreNoun`). **Místa, cíle i články** používají tutéž fotokartu (`PhotoCard` v `profile-cards.tsx`)
    jako výpis míst na stránkách míst — fotka na celou kartu, odznak typu (špendlík / list
    papíru), ztmavení zdola, bílý název a pod ním **cesta v hierarchii** („Asie / Myanmar"; u
    článku cesta jeho rodičovské stránky). Karty bez fotky a karty recenzí/komentářů jsou bílé
    s plným modrým odznakem, názvem cíle, hvězdičkami u recenzí a podpisem „Recenzováno /
    Komentováno: datum". Text na kartě plynule **vybledá** (`CardText`) — pevný počet řádků
    (`line-clamp`) při dvouřádkovém názvu přetékal a ořezával text v půli řádku.
  - Mřížka má **nejvýš 4 dlaždice** (`1 → 2 od sm → 3 od lg → 4 od xl`). Naměřené šířky karty:
    358 px (390), 324 px (768), 293 px (1024), 278 px (od 1280) — vždy krajina až čtverec, na
    který jsou nastavené i Cloudinary ořezy (`PlaceCardImage` kreslí desktop 1:1). Pět sloupců
    by dalo 218 px (poměr 0,78:1 = portrét) a jen ~27 znaků na řádek v textové kartě místo 36;
    ke 4 sloupcům se proto přechází až od 1280 px, protože při 1024 px by měly jen ~214 px.
    Výpis míst na webu má 3 sloupce jen ve variantě S MAPOU (zabírá 44 % šířky) — profil mapu
    nemá, takže 4 odpovídá pravidlu webu pro mřížku na celou šířku.
  - Data skládá `fetchUserProfile` (`src/lib/payload.ts`) VÝHRADNĚ z bezpečných polí (nikdy
    e-mail/role; obsah jen publikovaný přes `overrideAccess: false`), dlouhá těla recenzí
    a komentářů krátí na 400 znaků; cache invaliduje hook na Users (`user_profile_<username>`).
    Stránka je `noindex, follow` (jako legacy), profil bez veřejného obsahu vrací 404 a staré
    podadresy (`/profil/<username>/clanky`, `/mista`, `/recenze`…) se trvale přesměrovávají
    na kotvy profilu (`src/app/(frontend)/profil/[username]/[...rest]`).

- **Media (Správa souborů a obrázků)**:
  - Centrální úložiště pro všechny nahrané soubory.
  - **Alt text**: Každý obrázek vyžaduje vyplnění alternativního popisu pro lepší SEO a přístupnost.
  - **Veřejný přístup**: Kolekce je nastavena tak, aby byly nahrané soubory veřejně čitelné.
  - **Zpracování obrázků**: Podporuje automatické generování náhledů, ořezy a optimalizaci (poháněno knihovnou Sharp).
  - Podporuje definici fokusu (focal point) pro inteligentní ořezy.
  - **Limit 10 MB (Cloudinary) se řeší automaticky.** Cloudinary odmítne soubor nad 10 MiB
    a admin z toho dřív ukázal jen nicneříkající „Something went wrong" (HTTP 500). Hook
    `beforeOperation` v `src/collections/Media.ts` proto větší obrázek sám zmenší, a to od
    nejmenší ztráty k největší: nejdřív úspornější překódování v plném rozlišení, a teprve
    když to nestačí, zmenšování rozměrů (JPEG/PNG/WebP, typ souboru se nemění). Co se stalo,
    najdeš v logu serveru. **Soubory pod limitem se nepřekódovávají vůbec** — jdou na
    Cloudinary bit v bit, protože `media: true` originály schválně uchovává. Když zmenšit
    nelze (PDF, SVG), vrátí se česká chyba 400 místo 500.

- **Avatars (Profilové fotky uživatelů)**:
  - ZÁMĚRNĚ mimo `media`: do redakční knihovny (~3300 souborů) smí vkládat jen redakce, kdežto
    avatar si musí nahrát každý sám. Vlastní kolekce dává vlastní práva — `create` pro každého
    přihlášeného, `update`/`delete` jen pro vlastníka (pravidlo vrací QUERY `owner = req.user.id`,
    ne boolean, takže platí i na hromadné operace a výpis v adminu).
  - Limity kontroluje SERVER, ne prohlížeč (`beforeOperation`): jen JPEG/PNG/WebP, max 2 MB.
    `upload.mimeTypes` je jen filtr dialogu pro výběr souboru a dá se obejít.
  - **Ořez na čtverec 512×512 dělá server** (`resizeOptions` + `fit: 'cover'`) — legacy web po
    uživatelích chtěl, ať si čtvercovou fotku připraví sami, jinak se avatar deformoval.
  - Původní název souboru se zahazuje (`avatar-<userId>-<čas>.<ext>`) — bývá v něm jméno nebo
    cesta z cizího počítače a byl by veřejně v adrese.
  - Soubory jdou na **Cloudinary** stejně jako `media` (zapíná se per kolekce v
    `payload.config.ts`); lokální disk nepřipadá v úvahu, kontejner se při nasazení zahazuje.
    ⚠️ Na rozdíl od `media` **nemají zálohu na R2**.
  - Server akce mají výchozí strop těla 1 MB — kvůli dvoumegovým fotkám je v `next.config.mjs`
    zvednutý `serverActions.bodySizeLimit` na 3 MB.
  - ⚠️ **Nasazení — POŘADÍ KROKŮ**: (1) `pnpm backfill:verified` HNED po přenesení schématu
    a JEŠTĚ NEŽ se pustí provoz — se zapnutým `auth.verify` se bez příznaku `_verified`
    nepřihlásí nikdo včetně adminů; (2) `pnpm migrate:user-name` (jméno + příjmení → `name`);
    (3) teprve pak zahodit sloupce `first_name` / `last_name` — opačné pořadí = ztráta jmen;
    (4) převod avatarů (níž); (5) volitelně `pnpm cleanup:avatars` na osiřelé fotky.
  - ⚠️ **Nasazení**: převod stávajících avatarů z `media` dělá `pnpm migrate:avatars <mapa.json>`
    (stáhne a nahraje znovu). Postup: (1) před přepnutím schématu vyexportovat mapu
    `users ⋈ media`, (2) vynulovat `users.avatar_id` (jinak selže výměna cizího klíče),
    (3) přepnout schéma, (4) spustit skript. Na dev to takhle proběhlo.
  - **NA PRODUKCI (3. 8. 2026) TO PROBĚHLO JINAK.** Místo znovunahrávání se `avatars`
    napojily na TYTÉŽ soubory na Cloudinary, které už měla `media` (zkopírovaný
    `cloudinary_public_id` a `url`). Ušetřilo to 24 uploadů a fotky zůstaly na produkčním
    účtu. Ověřeno: `select count(*) from avatars a join media m on
m.cloudinary_public_id = a.cloudinary_public_id` → 24 z 24 sdílí soubor.
  - ⚠️ **Pozor při změně konfigurace úložiště.** Dnes je mazání záznamů v `media` bezpečné:
    plugin `payload-storage-cloudinary` maže soubor na Cloudinary JEN tehdy, když je kolekce
    nastavená objektem s volbami — u `boolean` (náš případ, `collections: { media: true,
avatars: true }`) se mazací handler hned vrátí. Kdyby se zápis změnil na objekt, začalo by
    mazání dokumentu odstraňovat i soubor — a smazáním 25 starých avatarů z `media` by zmizelo
    všech 24 profilových fotek, protože sdílejí stejné soubory. Pak je nutné avatary nejdřív
    nahrát jako vlastní kopie (`pnpm migrate:avatars`).
  - **Od 3. 8. 2026 mají avatary `folder: 'avatars'` a `deleteFromCloudinary: true`.** Vyměněná
    profilovka se tedy smaže i z Cloudinary (dřív se soubory hromadily navždy) a nové fotky
    padají do stejné složky, kde už migrované jsou.
  - ⚠️ **PODMÍNKA, na které to stojí: žádný avatar nesmí sdílet soubor s jinou kolekcí.**
    Migrované avatary sdílené s `media` proto byly z knihovny médií odstraněny (záznamy, ne
    soubory — u `media` je konfigurace `boolean`, takže mazání dokumentu soubor nechává být).
    Kdyby někdy vznikl sdílený soubor znovu, výměna profilovky by smazala soubor, který patří
    i druhé kolekci. Kontrola: `select count(*) from avatars a join media m on
m.cloudinary_public_id = a.cloudinary_public_id` musí vrátit 0.
  - `pnpm cleanup:avatars` maže osiřelé ZÁZNAMY přes Payload, takže se s nimi teď smaže
    i soubor. Než ho spustíš, ověř tou kontrolou výš, že nic není sdílené.

- **Comments (Komentáře a recenze)**:
  - Komentáře k článkům a recenze k místům/turistickým cílům (stránkám) — rozlišené polem `type` (`comment` / `review`); recenze má navíc hvězdičkové hodnocení. Cíl je polymorfní vazba `relatedTo` (článek / stránka).
  - **Web**: pod každým článkem se v plné šířce zobrazuje výpis komentářů (**nejnovější vlákna nahoře**; odpovědi uvnitř vlákna chronologicky) + formulář. Data načítá `fetchArticleComments` (`src/lib/payload.ts`) a skládá je do **vláken**, vykreslují komponenty v `src/components/features/comments/`.
  - **Vlákna**: sebe-referenční pole `parentComment` (odpověď na jiný komentář). Zobrazují se s jednou úrovní odsazení + spojovací linkou; odpověď na odpověď spadne také pod kořen. Autor článku (shoda `author` s `createdBy`) má u svých komentářů štítek „autor".
  - **Vkládání z webu**: běží přes Server Action (`src/lib/comment-actions.ts`) a Local API s `overrideAccess: true` — kolekce má `create: isAdmin`, takže bezpečná pole (typ, stav, cíl, `parentComment`) vynucuje action. Tlačítko „Odpovědět" předá cíl → nové odpovědi mají skutečnou vazbu. Autor je anonymní (jen jméno); registrovaní autoři migrovaných komentářů se zobrazují přes virtuální `authorPublic` (bezpečná podmnožina — username + avatar).
  - **Anti-spam**: honeypot + rate-limit + heuristika odkazů, volitelně Cloudflare Turnstile (`src/lib/comment-spam.ts`, viz `TURNSTILE_*` proměnné výše).
  - **Recenze na webu**: na stránkách kategorie **Turistický cíl** se pod obsahem zobrazuje sekce recenzí: lišta „Byl jsi zde? Ohodnoť to!" s hvězdičkovým vstupem a sbaleným formulářem, výpis recenzí (**nejnovější nahoře**, hvězdičky + „Recenzováno: dd.MM.yyyy", mikrodata schema.org/Review). Detail cíle má navíc **hodnocení v hero vedle názvu** (na mobilu pod ním; odkaz na `#recenze`), v pravém sloupci **praktické informace** (adresa, oficiální web, mapa s pinem cíle přes `MapLibreMap height`, autor — vzdušné legacy rozložení bez rámečku), pod recenzemi pás **„Co dalšího vidět…"** se sousedními cíli (`fetchTouristPointSiblings`, zobrazuje se při více než 2 sousedech) a vydává **JSON-LD `TouristAttraction` s `AggregateRating`** a recenzemi (hvězdičky ve výsledcích vyhledávání). Fotky v textu cíle mají stropovanou výšku (`poi-prose`). Spodní responzivní reklamní pruh (`LeaderboardAd`, legacy slot) se vykresluje na všech stránkách a článcích kromě homepage a statických stránek (viz Pages níže). Data načítá `fetchPageReviews` (`src/lib/payload.ts`, cache tag `page_reviews_<id>`), vkládání řeší Server Action `src/lib/review-actions.ts` (stejné anti-spam vrstvy jako komentáře; hodnocení 1–5 povinné), komponenty jsou v `src/components/features/reviews/`. Reklamní sloupec vpravo přepíná 300×250 / 300×600 podle počtu recenzí (jako legacy). Ve výpisu cílů na stránce místa („Co vidět…") se u každého cíle zobrazují vpravo vedle názvu hvězdičky (průměr zaokrouhlený na půl hvězdičky) s počtem recenzí — data dodává `fetchPageReviewStats` (jeden hromadný dotaz pro všechny cíle) — a pod názvem řádek s adresou (`detail.googleMapsAddress`) a oficiálním webem (`detail.website`); po rozbalení se vpravo u „Zobrazit méně" ukáže autor cíle (avatar + jméno z virtuálního `createdByPublic`, které se pro děti stránky tahá přes `PAGE_CHILDREN_SELECT`). Rozbalení cíle („Zobrazit více", klik na hodnocení, nebo kotva `#slug` v URL) ukáže pod textem i recenze cíle s formulářem přímo na stránce místa (`InlineReviews`): načítají se líně přes server action `getPageReviews` až po rozbalení, zobrazují se první 3 + „Zobrazit další" a formulář (vč. Turnstile) se otevírá až na kliknutí. Hvězdičky v liště „Byl jsi zde?" i u cílů bez recenzí („Ohodnoť jako první" vedle názvu) fungují jako přímý vstup — kliknutí otevře formulář s předvyplněným počtem hvězd (sdílená komponenta `StarInput`; plné šedé hvězdičky `StarRating` naopak jen zobrazují průměr).
  - Data se plní jednorázovým migračním skriptem `pnpm migrate:comments` z legacy MySQL databáze. Legacy web vlákna neměl — vazby odpovědí dopočítal `pnpm infer:replies` (kontextová analýza textů, `--apply` zapíše; ověřená mapa v `scripts/infer-comment-replies.ts`). V adminu lze `parentComment` kdykoliv ručně upravit.

- **Pages — statické stránky** (`O nás`, `Reklama`, `Podmínky užívání webu`; kategorie
  `Statická stránka`, odkazy z patičky):
  - Zakládá je idempotentní `pnpm seed:footer` (`scripts/seed-footer-and-static-pages.ts`)
    spolu s obsahem patičky.
  - **Čtecí sloupec stojí na ose stránky.** Ostatní stránky mají vedle textu panel 340 px
    (čas, kurz, obsah, reklama); statická stránka do něj nedává nic, takže se `<aside>` vůbec
    nevykreslí a sloupec se vystředí (`centerColumn` v `MainContent`). **Rubriky zůstávají
    vlevo** — pod textem jim začíná mřížka článků přes celou šířku, ke které se úvod zarovnává.
  - Bez vlastní fotky v CMS hero dědí sdílenou **výchozí obálku** (viz `DEFAULT_COVER_URL`
    u profilů výše) — dřív tam zůstával holý tmavý pruh.
  - **Bez spodního reklamního pruhu.** Stránky jsou krátké, takže by `LeaderboardAd` skončil
    jako nejvýraznější prvek pod pár odstavci — a na „Reklamě" by to byla reklama na stránce,
    která reklamu prodává (výjimka je v `src/app/(frontend)/[...slug]/page.tsx`).
  - **Sekce „Náš tým"** na `/o-nas` (`src/components/layout/page/team-section.tsx`) není
    v textu stránky, ale skládá se z **živých dat profilů**: karta = fotka, jméno, `@username`
    a tři počty příspěvků pod sebou, které vedou na kotvy profilu. Medailonek „o mně" na kartě
    ZÁMĚRNĚ není (tři odstavce textu daly pod dvouvětý úvod blok vyšší než celá stránka)
    a počty mají kratší popisky než profil („cílů" místo „turistických cílů"), protože tři
    karty na řádku mají po ~210 px.
    Pod tím řada tváří dřívějších přispěvatelů s odkazy na jejich profily. Kdo je „tým",
    říká `TEAM_USERNAMES` v `src/lib/team.ts` (v kódu ZÁMĚRNĚ — sestava se mění raz za pár
    let, zatímco obsah medailonku si každý autor spravuje sám ve svém profilu). Data dodává
    `fetchTeamSection` (`src/lib/payload.ts`): počty jsou levné `payload.count`, řazení tváří
    dvě agregace `GROUP BY` přes drizzle (payload.find by pro totéž prohnal afterRead
    pipeline přes 2 400 stránek). Technické účty (`NON_PERSON_USERNAMES`) do poděkování
    nepatří a do řady jdou jen lidé s fotkou.
  - **Sloučení duplicitních účtů**: `pnpm merge:duplicate-user` (bez `--apply` jen vypíše plán)
    přepíše autorství veškerého obsahu na ponechaný účet, doplní mu jméno/medailonek/avatar
    z rušeného a rušený smaže. Přímým SQL v jedné transakci — `payload.update` nad
    publikovanou stránkou by zakládal novou verzi a posunul `updatedAt`. Seznam sloupců
    s autorstvím si skript ověřuje proti cizím klíčům, takže nová kolekce s `createdBy`
    ho zastaví s chybou místo tichého osiření dat.

- **Transactions (Feather transakce)**:
  - Interní účetní záznamy „pírek" (feather) přenesené z původního webu — čtení i správa jsou omezené pouze na administrátory.
  - Každý záznam nese kategorii (odměny za obsah, bonus, výběr), počet pírek v poli `amount` (**kladné = zisk, záporné = výběr**) a volitelnou vazbu `relatedTo` na stránku, článek nebo komentář.
  - Data se plní jednorázovým migračním skriptem `pnpm migrate:transactions` z legacy MySQL databáze (viz krok 4 v Quick Startu).

## Questions

If you have any issues or questions, reach out to the development team.
