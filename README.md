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
   > **Historický obsah** (místa, cíle, články, komentáře, avatary, pírka) je do databáze
   > přenesený ze starého Grails webu nad MySQL. Migrace je **dokončená a její skripty byly
   > odstraněné** — čerstvý klon si data stáhne dumpem, ne doběhem. Viz „Stará databáze“ níž.
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
   - The uploaded file is first validated with `pg_restore --list` (also proves `pg_restore`/Docker are reachable). Only then are **all user schemas** in the target DB (`public`, `zaloha`, …) dropped with `CASCADE` and the restore runs. Without the wipe, `--clean` fails on tables that exist locally but not in the dump (e.g. local backup tables in `zaloha`) and the whole import rolls back.
   - The restore itself runs in a single transaction, but the schema wipe happens before it — if the restore still fails (e.g. a dump from an incompatible Postgres version), the database is left empty. Download a fresh dump first if you may need to roll back.
   - Requires the same Docker Compose access as the dump action.
9. **Automated production backups**: since 4 Sep 2026 the production server also
   takes a **daily unattended backup to Cloudflare R2** (`deploy/backup-db.sh` +
   a systemd timer). Kept for 30 days (daily) and 400 days (monthly); a failed
   backup sends an e-mail to `SMTP_FROM`. Setup, retention, restore steps and the
   two R2/rclone gotchas are documented in
   [`deploy/README.md`](deploy/README.md#zálohy-databáze). The admin dump/import
   actions above stay available for manual, ad-hoc use.

---

## Stará databáze (Grails + MySQL) — co z ní zbývá vědět

Migrace obsahu je dokončená a doběhy odstraněné, ale **stará databáze pořád existuje** a je
jediný zdroj věcí, které se do nového webu nepřenesly: pírka a spolupráce jako systém,
hodnocení afiliací, statistiky návštěv. Proto se hodí vědět, kudy se k ní dostat.

**Připojení** — proměnné `OLD_DB_HOST` / `OLD_DB_PORT` / `OLD_DB_USER` / `OLD_DB_PASSWORD` /
`OLD_DB_NAME`, popsané (zakomentované) v `.env.example`.

**Znalost starého schématu** je na dvou místech a ani jedno není samozřejmé:

| kde                             | co tam je                                                                                | pozor                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `grails/AI_MIGRATION_SOURCE.md` | architektura, doménový model, routování, chování avatarů (~290 řádků)                    | **v repu je** (výjimka v `.gitignore`); zbytek `grails/` zůstává jen lokálně |
| git historie                    | smazané skripty se skutečnými dotazy: názvy tabulek, mapování polí, ošetření zvláštností | smazal je commit `b745d2c`                                                   |

Konkrétní dotaz do historie:

```bash
git log --diff-filter=D --name-only -- 'scripts/*'   # co a kdy zmizelo
git show b745d2c^:scripts/migrate-pages.ts           # přečíst kterýkoli skript
git show b745d2c^:scripts/migrate-comments.ts
```

> **Znalostní báze je od 6. 8. 2026 součástí repa**, protože ležet na jednom disku bylo
> riziko — je to jediný souvislý popis toho, jak starý web fungoval. Tajemství neobsahuje
> (zkontrolováno). **Sám legacy kód v repu ale není**: `.gitignore` vylučuje `/grails/*`
> a vyjímá z toho jen ten jeden soubor. Pozor na tvar toho pravidla — vyjmout soubor
> z ignorované složky jde jen tak, že se ignoruje její OBSAH (`/grails/*`), ne složka
> samotná (`/grails/`); do vyloučené složky git vůbec nekoukne a výjimku by přeskočil.

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

### Jednorázové doběhy proti produkční databázi — čtyři pasti

Ověřeno naostro při doplňování affiliate deep-linků (14. 8. 2026, 657 stránek). Každá
z těchto pastí jeden běh shodila, proto stojí za zapsání:

1. **Skript pouštěj z verze kódu, která odpovídá NASAZENÉ**, ne z pracovní kopie:

   ```bash
   git worktree add --detach /tmp/wt-prod origin/main
   ln -s "$PWD/node_modules" /tmp/wt-prod/node_modules && cp .env /tmp/wt-prod/.env
   ```

   Pracovní kopie obvykle obsahuje rozpracovaná pole, která na produkci ještě nejsou
   (dev si sloupce přidává sám přes `push: true`, produkce ne) — Payload pak padá na
   chybějící sloupec. `DATABASE_URL` stačí exportovat, `dotenv` proměnnou z prostředí
   nepřepisuje.

2. **Postgres není zvenčí dostupný** (žádné `ports`, jen docker síť), takže tunel na IP
   kontejneru. IP se MUSÍ zjistit na serveru — `$(…)` přímo v příkazu `ssh -L` by se
   vyhodnotilo lokálně a vzalo IP místního kontejneru:

   ```bash
   PG_IP="$(ssh root@<server> "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' <pg-container>")"
   ssh -f -N -o ServerAliveInterval=30 -L "15432:${PG_IP}:5432" root@<server>
   ```

   Bez `ServerAliveInterval` tunel během dlouhého běhu odejde (`ECONNRESET`).

3. **Dlouhé ověřování odděl od zápisu.** Když skript nejdřív dvacet minut osahává cizí
   weby, spojení do DB mezitím zahálí a padne. Osvědčené: fáze 1 vypíše výsledky do JSON
   (`--report=…`), fáze 2 je z něj jen zapíše. Zápisový krok dělej **idempotentní** (co
   už sedí, přeskoč) — pak se dá po přerušení prostě spustit znovu.
4. **NIKDY neukládej stránky paralelně.** Souběh 5 skončil deadlockem: uložení stránky
   sahá i na řetězec předků (plugin nested-docs), takže dvě místa pod stejnou zemí se
   navzájem zablokují. Sekvenčně to je ~3 s/stránka a je to jediná bezpečná cesta.

Po zápisu do CMS mimo admin **vždy** `docker compose up -d --force-recreate cms`
(cache se invalidují jen z hooků v adminu).

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

| Variable                                                                                               | Required                   | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(maps need no key)_                                                                                   | —                          | Maps use OpenStreetMap via MapLibre + OpenFreeMap tiles (no key, no limits); the branded style is generated by `pnpm build:map-style` into `public/map-styles/aracze.json`. **Není to krok buildu** — vygenerované soubory (`public/map-styles/`, `public/maplibre/`) jsou verzované v gitu. Skript se pouští ručně po **aktualizaci `maplibre-gl`** nebo po změně stylu: kromě stylu kopíruje i worker vedle aplikace, protože bundlovaný worker pod Turbopackem tiše umře a mapa se pak načítá donekonečna. |
| `OPENWEATHER_API_KEY`                                                                                  | For weather                | Server-side klíč pro živé počasí na stránkách Počasí (`src/lib/weather.ts`, nikdy nejde do prohlížeče). Účet potřebuje předplatné **One Call 3.0** (_One Call by Call_): prvních 1 000 volání denně zdarma, další zpoplatněné — proto má účet nastavený tvrdý strop 1 000/den. Bez předplatného se web přepne na bezplatné endpointy (6denní předpověď).                                                                                                                                                      |
| `NEXT_PUBLIC_SITE_URL`                                                                                 | Recommended                | Public site URL for the sitemap and canonical links (default `https://ara.cz` — bez www, stejně jako `getSiteURL()`).                                                                                                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_PAYLOAD_BASE_URL`                                                                         | **Required in production** | Veřejná adresa webu: absolutní adresy obrázků, `serverURL` (kontrola původu požadavků) a odkazy v e-mailech. V produkci bez ní aplikace spadne — viz `publicBaseUrl()` v `src/lib/public-url.ts`; tichý fallback na localhost by znamenal, že odkazy v dopisech vedou na localhost a nikdo si toho nevšimne.                                                                                                                                                                                                  |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2` | Optional                   | Google AdSense units in article listings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `TURNSTILE_SITE_KEY`                                                                                   | Optional                   | Cloudflare Turnstile site key for the article comment form (anti-spam).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `TURNSTILE_SECRET_KEY`                                                                                 | Optional                   | Cloudflare Turnstile secret key (server-side token verification).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `KIWI_TEQUILA_API_KEY`                                                                                 | For Akční nabídky          | Server-side klíč Kiwi Tequila Search API pro denní sync `/api/sync-affiliate-deals` (sekce „Akční nabídky"). Účet je schválený partner z 2023 — od 5/2024 Tequila nové partnery nebere, klíč nerušit.                                                                                                                                                                                                                                                                                                         |

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
the Local API (see `src/lib/search.ts`); matching uses [Fuse.js](https://fusejs.io/).
V produkci se hotový index drží **v paměti procesu** (`src/lib/search-cache.ts`),
ne v `unstable_cache` — Next položky nad 2 MB do datové cache tiše neukládá (jen
`console.warn` „items over 2MB can not be cached“ v logu) a index má ~3 MB, takže
se dřív při každém písmenu četl celý web z DB (1,1–1,8 s na dotaz). Uložení nebo
smazání stránky v adminu index zahodí přímo z hooku (`invalidateSearchIndex`),
pojistkou je obnova na pozadí po hodině. Po nasazení hlídat
`docker compose logs cms | grep "over 2MB"` — stejný limit platí pro každé
`cached()` čtení.

- Query param `q` — the search term (empty `q` returns no matches).
- Response: `{ "success": true, "message": [ /* Fuse results */ ] }`.

Našeptávač (hlavička + homepage) ukazuje 10 nejlepších shod; **Enter nebo
tlačítko s lupou vede na stránku všech výsledků `/hledani?q=…`** (server-side
`searchPages`, max 50 položek, hero s výchozí fotkou, prázdný výsledek = menší
ara + pilulky „Kam dál" sdílené se 404 přes `KamDal`). Stránka má `noindex`
a je v `robots.ts` v `disallow` — výsledky hledání do indexu nepatří.

```bash
curl 'http://localhost:3000/api/search?q=chorvatsko'
```

### Živé počasí (bez vlastního endpointu)

Aktuální počasí, části dne a předpověď na stránkách kategorie **Počasí** čte
`fetchPlaceWeather` v `src/lib/weather.ts` přímo při renderu (server-side,
klíč tedy nikdy neopustí server) — vlastní proxy `/api/weather` byla zrušená,
protože ji nic nevolalo a mířila na vypnuté One Call 2.5.

- Zdroj: **OpenWeather One Call 3.0** (`OPENWEATHER_API_KEY`, předplatné
  _One Call by Call_; prvních **1 000 volání/den zdarma**, další 0,14 EUR/100 — proto
  se nastavuje tvrdý strop 1 000/den. Strop najdeš
  v _Billing plans → calls per day_). Souřadnice bere z **rodičovského místa**
  stránky počasí, popisky chodí česky (`lang=cz`).
- **Záložní cesta:** když One Call selže (vyčerpaný strop, výpadek, čerstvě
  aktivovaný klíč), sáhne se na bezplatné `/data/2.5/weather` + `/forecast` —
  předpověď je pak 6denní místo 7denní a nadpis se přizpůsobí sám. Web tak
  nikdy nezůstane bez počasí.
- Odpovědi se cachují **15 minut per souřadnice** (`next.revalidate`), takže
  víc návštěvníků stejného místa spotřebuje jeden dotaz. Selhání = stránka se
  vykreslí bez bloků počasí, nikdy nespadne.
- Části dne se zobrazují **chronologicky od aktuální chvíle** (Večer → V noci →
  Ráno → Odpoledne), stejně jako na starém webu.

### `POST /api/sync-analytics`

Denní sync návštěvnosti z **Google Analytics 4** do stránek
(`src/endpoints/syncAnalytics.ts`, GitHub Actions cron
`.github/workflows/sync-analytics.yml` ve 3:17 UTC; autentizace hlavičkou
`X-Sync-Secret` = `ANALYTICS_SYNC_SECRET` nebo admin session, `?dryRun=1` jen
vypíše vzorek). Jeden dotaz do GA4 (dimenze `pagePath` + `dateRange`) plní
**dvě klouzavá okna** najednou:

- `analyticsPageViews` — **12 měsíců**, řadí dlaždice v sekci „Co vidět" míst.
- `analyticsPageViews30d` — **30 dní**, vybírá **„Oblíbené:"** pod
  vyhledáváním na úvodní stránce (`fetchPopularDestinations` v
  `src/lib/payload.ts`): čtyři země s největším součtem zobrazení za **celý
  podstrom** země (podstránky, města, cíle — samotná stránka země má zlomek
  návštěv proti svým městům). Země = publikované „Místo k navštívení" přímo pod
  kontinentem; strom se jde po `parent` (rekurzivní CTE, limit hloubky), ne
  prefixem URL. **Výběr** čtveřice řídí 30 dní (sezónnost), **pořadí** bublinek
  12 měsíců, aby se nepřehazovaly každý den podle šumu. Dokud 30denní sloupec
  není naplněný (první noc po nasazení), vybírá se podle 12 měsíců; země bez
  návštěv se nedoplňují a chybějící místa dorovná ruční záložní čtveřice
  (Chorvatsko, Itálie, Řecko, USA). Ruční přepis z adminu záměrně není —
  automat se má nechat běžet.

Zápis jde **přímým SQL mimo Payload hooky** v jedné transakci (reset obou
sloupců na 0 → hromadný UPDATE po dávkách → totéž do **poslední verze
v `_pages_v`**, jinak by publikace stránky z rozpracovaného návrhu vrátila
stará čísla; advisory lock proti souběhu vrací 409), aby noční běh nespouštěl
revalidaci tisíců stránek — „Co vidět" se občerství pojistkou `revalidate: 300`
v `cached()`, homepage tag `homepage-popular-destinations` sync invaliduje sám.
Když GA4 nevrátí žádný rozpoznaný řádek (změna API), sync skončí **500** a nic
nevynuluje; `?dryRun=1` vypíše i `skippedRows`.

**Nasazení sloupce na produkci** (schema push jen v dev, viz „Jednorázové
doběhy"): před nasazením image

```sql
ALTER TABLE pages ADD COLUMN IF NOT EXISTS analytics_page_views30d numeric;
ALTER TABLE _pages_v ADD COLUMN IF NOT EXISTS version_analytics_page_views30d numeric;
```

pak force-recreate `cms` a ruční spuštění workflow _Sync analytics_ (jinak se
30denní čísla objeví až po noci).

### `POST /api/sync-affiliate-deals`

Denní obnova sekce **„Akční nabídky"** na stránkách míst: pro stránky
s vyplněným polem Affiliate stáhne **nejlevnější ZPÁTEČNÍ letenku z ČR do
destinace** (Kiwi Tequila Search API, ceny v CZK) a **nejlevnější zájezd
s odletem z Prahy** (Invia XML feed) a uloží je do JSON pole `affiliate.deals`
(viz `src/endpoints/syncAffiliateDeals.ts`).

- **Letenky jedním hromadným dotazem** (od 30. 8. 2026): všechny kódy destinací
  jdou do Kiwi v jednom `fly_to` s `one_for_city=1` (jedna nejlevnější letenka
  za cílové město) a `fly_from=CZ` (odlet z kteréhokoli českého letiště; karta
  ukáže „Brno ⇄ Řím" / „odlet z Brna", Praha se nezmiňuje). Evropa a dálkové
  destinace zvlášť (jiná délka pobytu) → **2 dotazy denně místo 36**.
  Letenky se řeší **po kódech, ne po stránkách** — Anglie a Londýn (oba LON)
  dostanou tutéž letenku. Nejlevnější let pro kód vybírá
  `pickCheapestPerCode` v `src/lib/kiwi-deals.ts` (2 písmena = země podle
  `countryTo.code`, 3 písmena = město nebo letiště); pole `Kiwi Fly To` proto
  v adminu pustí jen 2–3 písmena (`isValidKiwiCode`), jiný tvar sync vynechá
  a nahlásí. Počet dotazů běhu i kódy, které potřebovaly samostatný dotaz,
  jsou v souhrnu (`kiwiRequests`, `kiwiFallbackCodes`). Důvod: look-to-book
  poměr Kiwi níže — 36 dotazů denně by bez rezervace přetekl už za půl roku.
  **Past hromadného hledání:** bez `max_stopovers` Kiwi u širokého dotazu
  prohledá jen vzorek a za zemi vrátí dražší město (Itálie = Florencie
  3 046 Kč, zatímco Řím letí za 1 042; ověřeno 30. 8. 2026) — proto
  hromadný dotaz má `max_stopovers=1` do Evropy a `2` dálkově, a navíc se
  **samostatným dotazem** (bez stropu přestupů, přesně jako dřív) ověří kód,
  který (a) v hromadné odpovědi chybí, (b) má cenu o > 60 % nad referencí
  (medián historie, jinak včerejší cena — `isSuspiciousPrice`), nebo (c)
  zatím žádnou referenci nemá (první běh pro kód — historie nesmí začít na
  výkyvu). Bere se levnější z obou. V nejhorším případě (celá dávka špatná)
  je to tolik dotazů jako dřív, ne víc; první běh po nasazení má referenci ze
  starých cen, takže stojí jen pár dotazů navíc.
- **„Levnější než obvykle"**: sync ke každé destinaci ukládá historii denních
  cen letenky (`affiliate.deals.kiwiPriceHistory`, 90 dní, jeden bod na den,
  přežívá i den selhání Kiwi) a z jejího **mediánu** počítá `kiwi.usualPrice`
  (až od 14 dní historie — po nasazení se štítky rozsvítí zhruba po dvou
  týdnech). Karta kreslí modrý štítek „−25 % než obvykle" jen při rozdílu
  ≥ 15 % (`belowUsualPercent`); slovník **nikdy „sleva"** — nikdo nic
  nezlevnil, Kiwi žádnou původní cenu neposílá. Žádná změna schématu DB —
  všechno leží v existujícím JSON sloupci. Sync zapisuje i do **poslední
  verze** stránky (`_pages_v.version_affiliate_deals`, `latest = true`):
  uložení stránky v adminu skládá data z ní a bez toho by publikace vrátila
  starou nabídku a smazala celou historii. Historie přežije i dočasně
  smazaný kód letiště (karta se jen skryje).
- Zdroje na stránce (tab **Affiliate** v adminu): `Kiwi Fly To` — IATA kód
  města (LON, PAR) nebo země (HR, GR); `Invia XML feed (URL)` — odkaz
  „Vygenerovat XML" z [affil.invia.cz](https://affil.invia.cz) (feedy
  „&lt;Destinace&gt; – ara.cz", odlet z Prahy, Data1=`akcni-nabidky`).
  Jednorázové naplnění: `pnpm backfill:affiliate-deals -- --apply`.
- Spouští GitHub Actions cron denně ve 3:41 UTC
  (`.github/workflows/sync-affiliate-deals.yml`, ruční běh přes _Run
  workflow_); autentizace hlavičkou `X-Sync-Secret` = `ANALYTICS_SYNC_SECRET`
  (sdílené se sync-analytics) nebo admin session.
- Endpoint odpoví **hned 202** a sync doběhne na pozadí (`after()` z Next) —
  stahování trvá přes minutu a Cloudflare utíná spojení po 100 s (HTTP 524).
  Souhrn běhu je v logu serveru:
  `docker compose logs cms | grep sync-affiliate-deals`. Jen `?dryRun=1`
  zůstává synchronní a vypíše, co by se zapsalo (nic neukládá).
- Souběžný běh (ruční spuštění přes běžící cron) endpoint odmítne hned
  **409** — jinak by obě volání zbytečně stáhla vše proti kvótě Kiwi.
- Zápis jde **přímým SQL mimo Payload hooky** (stránky mají drafts — denní
  update přes Local API by sypal historii verzí) a cache stránek se
  invaliduje ručně přes `revalidateTag`. Selhání zdroje nechá minulou
  nabídku beze změny.
- Stejný běh plní i dlaždice zájezdů homepage sekce **„Dnešní akční
  nabídky"**: z Inviou kurátorovaného feedu (globál **Homepage → Dnešní
  akční nabídky**, feed s „Defaultním cílením Invia") vybere letecké zájezdy
  s odletem z českého letiště (Praha, Brno, Ostrava, Pardubice, Karlovy Vary;
  dlaždice zmíní odlet, když není z Prahy), seřadí podle výše slevy (štítek
  „−65 %" na dlaždici),
  odstraní duplicitní hotely a kandidáty uloží do `dealsOfDay.deals` globálu
  (přímým SQL ve stejné transakci jako stránky). Web při čtení odfiltruje
  propadlé termíny, poskládá pestrý výběr přes destinace a kreslí první 4;
  bez URL feedu (nebo když přežije méně termínů) dorovná řádek starším
  chováním (nejlevnější zájezdy destinací). Letenky sekce zůstávají z Kiwi
  přes stránky destinací.
  **Nasazení:** sloupce globálu se na produkci nepřidávají samy (push jen
  v dev) a globál Homepage čte i menu na každé stránce — proto **PŘED**
  nasazením spustit
  `ALTER TABLE homepage ADD COLUMN IF NOT EXISTS deals_of_day_invia_feed_url varchar, ADD COLUMN IF NOT EXISTS deals_of_day_deals jsonb;`
  (starý kód sloupce navíc ignoruje), pak URL feedu v adminu a sync.
- **Po nasazení změn v letenkách spusť sync ručně** (Actions → Sync affiliate
  deals → Run workflow). Do jeho doběhnutí drží databáze starší záznamy;
  letenka bez počtu nocí pochází z doby jednosměrného hledání a karta se
  proto vůbec nevykreslí — radši nic než cena, která by pod popiskem
  „zpáteční" lhala. Zájezdů se to netýká.
- Letenky jsou **zpáteční**, ne jednosměrné: cena je to, co člověk opravdu
  zaplatí, sedí k ceně zájezdu na vedlejší kartě a provize se počítá
  z rezervace (jednosměrná cena láká na klik, ale po zjištění celkové ceny
  odrazuje). Délka pobytu 3–14 nocí, u dálkových destinací 7–21 nocí
  (dálková = leží mimo Evropu, pozná se z prvního drobečku stránky — ne ze
  seznamu kódů, protože pole přijímá i kódy měst). Karta délku ukazuje
  („zpáteční · odlet 12. 11. 2026 · 7 nocí · Kiwi.com").
- Kiwi kvóty: 30 dotazů/min a **look-to-book ratio 1 rezervace / 5000
  dotazů** (jinak hrozí vypnutí účtu) — proto hromadné dotazy, rozestupy
  mezi nimi a jen jeden běh denně. Ceny Kiwi mezi dotazy mírně kolísají
  (prohledává vzorek nabídek), proto homepage i stránky míst čtou z jedněch
  nasyncovaných dat.
- Zájezd bez odletu z Prahy se **nezobrazuje** (feed vrací i odlety
  z Krakova/Vídně; inzerovat je Čechům by bylo zavádějící) — proto může mít
  destinace jen kartu letenky (např. Malta).
- **Nasazení na produkci:** do `/opt/aracze/.env` přidat
  `KIWI_TEQUILA_API_KEY` **a přidat pro něj řádek do `environment:` služby
  `cms`** v serverovém `/opt/aracze/docker-compose.yml` (compose proměnné
  vyjmenovává, samotné `.env` nestačí — viz `deploy/docker-compose.yml`);
  schéma doplnit SQL **ještě PŘED nasazením kódu** (nový kód sloupce čte,
  takže po deployi by stránky hlásily chybu) — POZOR i na verzní tabulku
  `_pages_v`, bez jejích sloupců spadne publikování stránek v adminu:

  ```sql
  ALTER TABLE pages
    ADD COLUMN IF NOT EXISTS affiliate_invia_feed_url varchar,
    ADD COLUMN IF NOT EXISTS affiliate_deals jsonb;
  ALTER TABLE _pages_v
    ADD COLUMN IF NOT EXISTS version_affiliate_invia_feed_url varchar,
    ADD COLUMN IF NOT EXISTS version_affiliate_deals jsonb;
  ```

  Ruční SQL místo Payload migrace je v projektu ZÁMĚR: repo drží jedinou
  initial migraci a produkce se zarovnává ručním SQL (viz dřívější změny
  schématu), `PAYLOAD_RUN_MIGRATIONS` se na prod nepouští. Pak backfill,
  force-recreate cms a ruční spuštění workflow.

- **Drafty:** JSON `deals` je součást verzovaného dokumentu — sync proto
  přepisuje i poslední verzi v `_pages_v`; publikování ještě STARŠÍ verze
  stránky může vrátit starší nabídky a nejbližší noční sync je přepíše
  (vědomě přijaté zjednodušení).

```bash
# Hlavička jde do curlu STDINEM (`-H @-`), ne argumentem: argumenty procesu
# jsou na stroji čitelné (ps), takže by tajemství šlo přečíst.
curl -X POST 'http://localhost:3000/api/sync-affiliate-deals?dryRun=1' \
  -H @- <<< "X-Sync-Secret: $ANALYTICS_SYNC_SECRET"
```

### `POST /api/sync-climate-normals`

Dlouhodobé měsíční průměry pro sekci **„Nejlepší doba na cestu…"** na stránkách
kategorie **Počasí**: pro každou publikovanou stránku počasí stáhne
z [Meteostat API](https://dev.meteostat.net/api/point/daily) **denní** data za
posledních 20 ukončených let podle souřadnic **rodičovského místa**, spočítá
z nich měsíční průměry teplot a úhrny srážek a uloží je do JSON pole
`climateNormals` (viz `src/endpoints/syncClimateNormals.ts`). Graf kreslí
`climate-section.tsx` — měsíce obarvené podle vhodnosti návštěvy, CSS tooltipy
bez klientského JS, pod grafem tabulka pro čtečky.

- **Proč klouzavé okno místo oficiálních normálů:** `point/normals` vrací
  třicetiletá období WMO, nejnovější 1991–2020 — nezmění se do roku 2031 a na
  webu by trvale svítilo „období 1991–2020". Klouzavé okno se každý rok posune
  („za roky 2006–2025"). **Proč denní data:** měsíční agregáty Meteostatu mají
  srážky jen u zlomku měsíců (Londýn 24 %), z denních vyjde 75 %.
- Klíč `METEOSTAT_RAPIDAPI_KEY`: [rapidapi.com](https://rapidapi.com) →
  vyhledat „Meteostat" → **Subscribe** (plán Basic, zdarma) → zkopírovat
  `X-RapidAPI-Key`. Kvóta 500 dotazů/měsíc, jedno místo stojí **2 dotazy**
  (API pouští max. 3 650 dní na dotaz).
- **Běh je přírůstkový**, takže kvótu nepřeteče ani s přibývajícími
  destinacemi: bere jen stránky bez dat a starší než 330 dní, nejvýš 200 míst
  za běh; zbytek ohlásí jako `deferred` a dopočítá ho příští běh. Cron jede
  měsíčně (20. den ve 4:17 UTC — kvóta RapidAPI se obnovuje podle dne zřízení
  předplatného, 14. 8., takže běh na začátku měsíce by narazil na vyčerpaný
  limit) a většinou nemá co dělat — nové destinace se
  tak doplní samy do měsíce.
- Parametry pro ruční běh: `?dryRun=1` (jen vypíše), `?force=1` (přepočítá
  i čerstvá data — nutné po změně metodiky), `?slug=/anglie/londyn/pocasi`
  (jediná stránka), `?maxPlaces=N` (jiný strop na běh).
- Autentizace a chování stejné jako sync-affiliate-deals: hlavička
  `X-Sync-Secret` = `ANALYTICS_SYNC_SECRET` nebo admin session; `?dryRun=1`
  jen vypíše, co by se zapsalo; zápis přímým SQL mimo hooky + ruční
  `revalidateTag`; selhání místa nechá poslední úspěšná data.
- Licence dat **CC BY 4.0** — web u grafu uvádí „Zdroj: Meteostat"
  (nemazat, je to podmínka licence).
- **Nasazení na produkci — SQL MUSÍ BÝT DŘÍV NEŽ MERGE.** Merge do `main`
  spouští automatický deploy a nová aplikace čte `climate_normals` v každém
  dotazu na stránky; dokud sloupec v produkční databázi není, Postgres vrací
  chybu a **spadne celý web**, ne jen počasí. Pořadí tedy:

  1. SQL na produkční databázi (POZOR — i verzní tabulka `_pages_v`, bez
     jejího sloupce spadne publikování stránek v adminu):

     ```sql
     ALTER TABLE pages ADD COLUMN IF NOT EXISTS climate_normals jsonb;
     ALTER TABLE _pages_v ADD COLUMN IF NOT EXISTS version_climate_normals jsonb;
     ```

  2. `METEOSTAT_RAPIDAPI_KEY` a `OPENWEATHER_API_KEY` do `/opt/aracze/.env`
     (a hlídat, že je vyjmenovává i `deploy/docker-compose.yml` — jinak se do
     kontejneru nedostanou).
  3. Teprve pak merge PR, force-recreate `cms` a ruční spuštění workflow
     _Sync climate normals_.

```bash
# Hlavička jde do curlu STDINEM (`-H @-`), ne argumentem — viz sync-affiliate-deals výš.
curl -X POST 'http://localhost:3000/api/sync-climate-normals?dryRun=1' \
  -H @- <<< "X-Sync-Secret: $ANALYTICS_SYNC_SECRET"
```

---

## How it works

The Payload config is tailored specifically for the project needs in `src/payload.config.ts`.

Pravidla navigace na webu (drobečky, sekundární menu, skládání adres z hierarchie stránek
jsou popsaná v [docs/navigace.md](docs/navigace.md). Adresy se přepočítávaly a skloňované
tvary názvů míst doplňovaly jednorázovými doběhy (`fix:page-urls`, `fix:declension`); ty jsou
hotové a odstraněné — u nových míst se tvary vyplňují v adminu.

### SEO — metadata, sitemap, strukturovaná data

Metadata stránek skládá `src/lib/seo.ts` (`buildPageMetadata`), volá ho `generateMetadata`
v `src/app/(frontend)/[...slug]/page.tsx` a homepage `page.tsx`:

- **Titulek a popisek** berou SEO záložku z CMS (`meta.title`, `meta.description` — u stránek
  a článků migrovaných z Grails vyplněná). Jediná přípona na celém webu je layout šablona
  `%s • Ara.cz` (krátká schválně — Google ukazuje ~60 znaků, klíčová slova nesou titulky
  samy; homepage má vlastní absolutní titulek). Legacy přípony (`| Ara.cz`, `- cestovní
průvodce Ara.cz`, `- Cestovní inspirace Ara.cz`, překlep `•vAra.cz`) i už vyplněnou
  `• Ara.cz` odřezává `stripSiteSuffix`, aby se přípona nepřidala dvakrát. Bez SEO titulku se použije šablona kategorie, resp. kontextový titulek
  z `buildPageTitle`. Popisek bez `meta` = šablona kategorie, jinak začátek textu zkrácený na
  hranici slova (`DESCRIPTION_MAX` 160), úplně bez textu výchozí popisek layoutu
  (`DEFAULT_DESCRIPTION`). Pro stránky (Page) to celé počítá `src/lib/page-seo.ts`
  (`resolvePageSeo`, React-cache) — sdílí ho `generateMetadata` i JSON-LD v komponentě Page,
  aby meta description a strukturovaná data říkaly totéž.
- **Canonical** je vždy absolutní (`metadataBase` v layoutu + `getSiteURL()`); u článků míří na
  `mainPage.fullSlug/slug`, i když je článek zobrazený pod vedlejší stránkou.
- **Open Graph / Twitter**: `og:type` (website/article), `siteName`, `locale cs_CZ`, náhled
  z hero fotky přes Cloudinary transformaci `f_auto,q_auto,c_limit,w_1200` (šířka 1200 je ve
  whitelistu media proxy); bez fotky (homepage, statické stránky) výchozí `public/og-default.png`
  (1200×630, logo na modré, generované ze SVG loga v CMS). Next vnořená pole `openGraph` mezi layoutem a stránkou NESLUČUJE —
  proto každá stránka skládá celý objekt přes helper, ne po částech.
- **JSON-LD**: články vydávají `Article` (autor `Person` s odkazem na profil, `datePublished`
  z `publishedAt`, `dateModified` z `updatedAt`, fotka, vydavatel) — `articleJsonLd` v
  `src/lib/seo.ts`; datum vydání je i viditelně u autora (`formatPublishDate`). Stránky mají
  `BreadcrumbList` a turistické cíle `TouristAttraction` (viz Pages níže).
- **Sbalený text míst** (`CollapsiblePageTextWithContributor`) jde do HTML VŽDY celý a sbaluje
  ho jen CSS — dřív se HTML usekávalo za druhým odstavcem a vyhledávače u zemí/měst viděly jen
  úvod.
- **Sitemap** (`src/app/(frontend)/sitemap.ts`) je `force-dynamic`: skládá se až za běhu z
  `cached()` dotazu (tag `sitemap`, invalidace při publikaci), nikdy při buildu obrazu (kde
  CMS neběží — dřív se tak zapekla verze „jen homepage" a po každém nasazení ji dostal první
  dotaz). Při výpadku CMS vrací 500, ne sitemapu s jedinou adresou.
- **Šablony titulků a popisků podle kategorie** (`src/lib/seo-templates.ts`): starý web měl
  SEO pole vyplněná ručně, ale podle ustálených vzorů („Vstupní podmínky a víza do Peru",
  „Čím platit ve Slovinsku - aktuální měna a ceny", „Inspirace a doporučení pro cestování do
  Norska…"). Vzory jsou přepsané do kódu a používají se dvakrát: jako fallback webu, když SEO
  pole chybí, a v adminu pod tlačítky „Vygenerovat" u SEO polí (`src/lib/seo-admin.ts` přes
  `seoPlugin.generateTitle/Description`; nadřazené místo pro skloňování dohledá po řetězci
  `parent`). Skloňování z `detail.genitive` („do Norska") a `detail.locative` („v Norsku"),
  bez nich název s předložkou. Šablony mění jen `<title>`/popisek — viditelný h1 dál skládá
  `buildPageTitle`. Stránky a články, které po migraci SEO pole neměly, doplnil jednorázově
  `scripts/seo-fill-missing-meta.sql` (idempotentní; na produkci spustit stejně jako ostatní
  SQL doběhy + force-recreate `cms`). Titulky zděděné ze starého webu („Läckerli Huus:
  Cestovní průvodce Basilejí") zůstávají, kde jsou správně skloněné a vejdou se do ~60 znaků;
  rozbité (bez města), příliš dlouhé a nesklonované u turistických cílů vynuluje
  `scripts/seo-legacy-titles-targets.sql`, aby se uplatnila šablona (rozhodnutí 4. 9. 2026;
  šablona cíle bez 6. pádu místa dává „Název – cestovní průvodce", ne „v Astana"). Přípona
  titulku je všude „ • Ara.cz" (layout šablona i generátor v adminu).
  Pády míst, která po migraci žádné neměla (456 z 669), doplňuje
  `scripts/seo-fill-place-cases.sql` (tvary navržené AI, prošlé uživatelem 4. 9. 2026;
  zapisuje jen do prázdných polí, i do `_pages_v`).
- **Strukturovaná data navíc**: homepage `WebSite` + `SearchAction` (`/hledani?q=…`) a
  `Organization` (logo `/icon-512.png`) v jednom `@graph`; stránky „Místo k navštívení"
  `TouristDestination` (popis, fotka, souřadnice, nadřazené místo); turistické cíle
  `TouristAttraction` vždy (popis, fotka, poloha), `AggregateRating` + recenze jen když nějaké
  mají (prázdné hodnocení by bylo nevalidní).
- **robots.txt** (`src/app/robots.ts`) zakazuje jen ne-HTML cíle: `/go/`, `/admin`, `/api/`.
  Stránky účtu ani `/hledani` schválně NE — mají `noindex`, a ten Google uplatní jen u URL,
  kterou smí stáhnout (zakázaná adresa by v indexu zůstala „bez popisu").
- **RSS** nejnovějších článků: `/feed.xml` (`src/app/(frontend)/feed.xml/route.ts`, data
  `fetchFeedArticles` s tagy `articles`/`pages`); odkaz `<link rel="alternate">` nese každá
  stránka (`RSS_ALTERNATE` v `buildPageMetadata` i layoutu — `alternates` se mezi layoutem
  a stránkou neslučuje).
- **Ikony a manifest**: `src/app/icon.png` (512 px) + `public/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` (papoušek z loga v CMS, vykreslený ze SVG přes sharp),
  `src/app/manifest.ts` a `themeColor` (`viewport` v layoutu) v modré hlavičky `#215491`.
- **Obrázky**: hero fotka má `alt` = popisek média z CMS (`Media.alt`, doplňuje ho
  `fetchMediaBasicsByIds`), bez něj název stránky/článku; sdílená výchozí obálka (profil,
  přihlášení, hledání, statické stránky bez fotky) `alt=""`, je to dekorace; fotky v rich textu nesou `width`/`height` (žádný posun rozvržení),
  `loading="lazy"` a `decoding="async"`. Rich text renderuje `h1` z editoru jako `h2` (jediný
  h1 je název v heru) a nebezpečný odkaz vypíše jen jako text (dřív `href="#"`).
- **Písma**: načítají se jen používané řezy — Open Sans 300–700, Poppins 400/600/700/800
  (každý řez × subset je samostatný preload soupeřící s hero fotkou).

### Sdílené stavební prvky výpisů (dlaždice, řádky, tlačítka, hodnocení)

Výpisy obsahu se od 29. 8. 2026 (PR #86, #87) skládají ze čtyř sdílených komponent — dřív
měl každý výpis vlastní kopii a vzhled se rozjížděl (rohy, ztmavení, tučnost). Když se má
změnit vzhled dlaždic nebo řádků, sahej sem, ne do jednotlivých sekcí:

- **`PhotoTile`** (`src/components/features/photo-tile.tsx`) — fotodlaždice „fotka + bílý
  titulek přes ztmavení": „Co vidět" u míst, profil, „Co dalšího vidět" pod cílem a tři
  sekce homepage. Tři velikosti (`sm`/`md`/`lg`), volitelný odznak v rohu (`PinIcon`),
  řádek `meta` pod titulkem (hodnocení). Obrázek dodává volající jako `children`; bez fotky
  se ukáže `NoPreview`. Rám (`PHOTO_TILE_FRAME`) sdílí i bílé karty profilu.
- **`ThumbRow`** + **`Thumb`** (`src/components/features/thumb-row.tsx`) — řádek
  „miniatura + titulek": výsledky hledání i našeptávače, „Nejnovější články", panel „Články
  v rubrice", „Co je nového". Dvě velikosti (`md` 48 px, `sm` 44 px); titulek si řádek kreslí
  sám (tučnost podle velikosti), doplňky (štítek, cesta, čas) dává volající přes `children`.
- **`LoadMoreButton`** (`src/components/features/load-more-button.tsx`) — „Zobrazit další":
  varianta `pill` (samostatná pilulka pod sekcemi) a `text` (vložený modrý odkaz ve výpisu
  recenzí a novinek), oba se stejným chevronem.
- **`RatingSummary`** (`src/components/features/reviews/rating-summary.tsx`) — „★★★★☆
  12 recenzí" pro dlaždice, hlavičku cíle i hero; jediné místo s pravidlem zaokrouhlení na
  půl hvězdičky (`halfStarRating`). Nula recenzí je platná hodnota a zobrazuje se.

Pravidla tučnosti a velikostí (rozhodnutí uživatele z 29. 8. 2026) jsou zapsaná v hlavičkách
těchto souborů, ne tady — README jen říká, kde je hledat. Odznaky míst záměrně používají dvě
rodiny ikon: vyplněný špendlík (`PinIcon`) na fotce, obrysový lucide `MapPin` v textových
řádcích („Co je nového", hledání) — na fotce sedí plná plocha, v řádku textu tenká linka.

### Fotky dlaždic míst — `<picture>` místo tří `next/image`

Dlaždice v „Co vidět", „Co dalšího vidět" a na profilu (`PlaceCardImage`,
`src/components/layout/page/place-card-image.tsx`) mají jiný ořez pro mobil (5:7 nebo 3:2
přes celou šířku), tablet (3:2) a desktop (5:7 vedle mapy / 1:1). Kreslí ho jeden nativní
`<picture>` se třemi `<source media>` — prohlížeč vybere JEDNU variantu podle šířky okna a hustoty
pixelů a stáhne jen ji. Do 4. 9. 2026 to byly tři `next/image fill` přepínané `hidden lg:block`;
u pevné šířky v pixelech (`sizes="210px"`) ale `next/image` vypisuje všech 14 šířek
z `imageSizes ∪ deviceSizes`, takže jedna dlaždice nesla 26 adres (~4,3 kB) a Řecko s 96 místy
mělo 420 kB HTML jen v adresách fotek (HTML 992 → 635 kB v dev). Šířky kandidátů musí být
z whitelistu media proxy (`ALLOWED_WIDTHS` ve `workers/media-proxy/src/media-path.ts`), jinak
Worker vrátí 400 — nová šířka v kódu = nejdřív rozšířit whitelist a nasadit Worker. Komponenta
zůstává klientská záměrně: přes RSC hranici jdou jen props, ne hotový `<picture>` (jako serverová
by RSC payload narostl o to, co se ušetřilo v HTML). Špendlík na dlaždicích (`PinIcon`) a hvězdičky
(`StarRating`) jsou CSS masky (`.pin-glyph`, `.star-glyph` v `globals.css`), ne inline SVG —
na stránce s desítkami dlaždic to byly desítky kB opakovaného SVG.

### Fotky v obsahu — lightbox (PhotoSwipe)

Klik na fotku v článku otevře **lightbox** (PhotoSwipe v5): zvětšení přes ztmavenou stránku,
zoom kolečkem/dvojklikem/pinchem, swipe mezi fotkami, zavření Esc/tažením dolů. Dřív odkaz
vedl na surové Cloudinary URL (`c_fit,w_800` — jen o 10 px víc než náhled) a odvedl čtenáře
z webu; `rel="lightbox"` je pozůstatek legacy webu, kde ho obsluhoval Lightbox2.
Odkazy generuje `richTextToHtml` (`src/lib/rich-text-html.ts`): míří na `c_limit,w_1600,f_auto,q_auto`
a nesou `data-pswp-width/height` spočtené z rozměrů média v DB (PhotoSwipe je potřebuje předem).
Obsluhu zapíná `RichTextLightbox` v layoutu (`src/components/features/rich-text-lightbox.tsx`) —
jedna instance deleguje klik z `<body>` (pokryje i rozbalovací texty a přechody mezi stránkami),
jádro knihovny se stahuje až při prvním kliknutí. Titulek v lightboxu se přebírá z popisku
pod fotkou (`.image-caption`), fotky bez rozměrů v DB mají fallback z náhledu.

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
    Pokus o registraci s obsazenou adresou pošle majiteli e-mail „účet už máš" s odkazem
    na obnovu hesla — jemu se to říct smí (je to jeho schránka), formulář dál mlčí.
  - **E-maily webu** (potvrzení účtu, obnova hesla, „účet už máš") skládá sdílená šablona
    `src/lib/email-template.ts`: logo nad bílou kartou, kresba papouška, titulek a jedno
    tlačítko s náhradním odkazem. Tabulky + inline styly + systémové písmo — nic jiného
    poštovní klienti spolehlivě neumí; prostotextová pole si šablona escapuje sama.
    Obrázky generuje `pnpm build:email-assets` do `public/assets/email/` — **není to krok
    buildu**, výstup je verzovaný v gitu (jako u map) a skript se pouští ručně po změně
    loga nebo kresby.
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
    Stará data (25 účtů) převedl jednorázový doběh, dnes už odstraněný; pole `firstName`/`lastName`
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

  - ⚠️ **Zapnutí `auth.verify` si vyžádalo jednorázový doběh** (`backfill:verified`, dnes odstraněný) — označil stávající
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
  - **Cloudinary účet běží v režimu Strict transformations** (od srpna 2026): zmenšeninu
    vyrobí jen na podepsanou adresu, a podepisuje výhradně media proxy (`workers/media-proxy`,
    `signTransform`). Důvod: úložiště tvořily ze ⅔ odvozeniny (57 tisíc variant, ~11 GB), které
    si boti se starými adresami (`w_3840`, vzory starého Grails webu) vyráběli znovu i po jejich
    smazání. Nová transformace v kódu = přidat ji do whitelistu Workeru, jinak přes proxy padá
    na 400; adresy `res.cloudinary.com` s transformací mimo proxy Cloudinary odmítne (404),
    originály bez transformace fungují dál. Podrobnosti v `workers/media-proxy/README.md`.

- **Avatars (Profilové fotky uživatelů)**:
  - ZÁMĚRNĚ mimo `media`: do redakční knihovny (~3300 souborů) smí vkládat jen redakce, kdežto
    avatar si musí nahrát každý sám. Vlastní kolekce dává vlastní práva — `create` pro každého
    přihlášeného, `update`/`delete` jen pro vlastníka (pravidlo vrací QUERY `owner = req.user.id`,
    ne boolean, takže platí i na hromadné operace a výpis v adminu).
  - Limity kontroluje SERVER, ne prohlížeč (`beforeOperation`): jen JPEG/PNG/WebP, max 2 MB.
    `upload.mimeTypes` je jen filtr dialogu pro výběr souboru a dá se obejít.
  - **Ořez na čtverec 512×512 dělá server** (`resizeOptions` + `fit: 'cover'`) — legacy web po
    uživatelích chtěl, ať si čtvercovou fotku připraví sami, jinak se avatar deformoval.
  - **Ruční výřez v prohlížeči** (`avatar-crop-dialog.tsx`, knihovna `react-easy-crop`):
    po vybrání souboru v profilu se otevře dialog — fotka se posune tažením a přiblíží
    posuvníkem/štipcem, kruh odpovídá přesně budoucí profilovce. Výřez se ořízne už na
    klientu (canvas → JPEG 512 px), takže projde i fotka větší než 2 MB; serverový ořez
    ze středu zůstává jako pojistka, když klient fotku nepřečte (pošle se originál).
  - Původní název souboru se zahazuje (`avatar-<userId>-<čas>.<ext>`) — bývá v něm jméno nebo
    cesta z cizího počítače a byl by veřejně v adrese.
  - Soubory jdou na **Cloudinary** stejně jako `media` (zapíná se per kolekce v
    `payload.config.ts`); lokální disk nepřipadá v úvahu, kontejner se při nasazení zahazuje.
  - **Záloha v R2 je ZRCADLO, ne archiv** (hooky v `Avatars.ts`, sdílená logika
    `src/lib/r2-backup.ts`): drží vždy jen aktuální avatar — při výměně/smazání se starý
    soubor maže i z R2 (bucket je veřejně čitelný přes `media-backup.ara.cz` kvůli nouzovému
    režimu media proxy, odložené fotky tam nepatří). Bez status pole; dorovnání a úklid
    osiřelých klíčů = `pnpm backup:avatars` (jednorázově po nasazení, pak jen při problémech).
    Staré migrované avatary bez složky `avatars/` sdílejí soubor s `media` — jejich zálohu
    vlastní `media`, zrcadlo je přeskakuje.
  - Server akce mají výchozí strop těla 1 MB — kvůli dvoumegovým fotkám je v `next.config.mjs`
    zvednutý `serverActions.bodySizeLimit` na 3 MB.
  - **Nasazení proběhlo** v tomto pořadí (zaznamenané pro případ, že by se stavěl nový
    provoz od nuly): (1) označit stávající účty za ověřené HNED po přenesení schématu a JEŠTĚ
    NEŽ se pustí provoz — se zapnutým `auth.verify` se bez příznaku `_verified` nepřihlásí
    nikdo včetně adminů; (2) převod jména a příjmení do `name`; (3) teprve pak zahodit sloupce
    `first_name` / `last_name` — opačné pořadí = ztráta jmen; (4) převod avatarů (níž);
    (5) úklid osiřelých fotek. Doběhy ze všech těchto kroků jsou dnes odstraněné (viz git
    historie) — proběhly a schéma i data jsou v cílovém stavu.
  - **Nasazení**: převod stávajících avatarů z `media` udělal jednorázový doběh, dnes už
    odstraněný (stáhl a nahrál je znovu). Postup byl: (1) před přepnutím schématu vyexportovat mapu
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
    nahrát jako vlastní kopie (dělal to onen odstraněný doběh).
  - **Od 3. 8. 2026 mají avatary `folder: 'avatars'` a `deleteFromCloudinary: true`.** Vyměněná
    profilovka se tedy smaže i z Cloudinary (dřív se soubory hromadily navždy) a nové fotky
    padají do stejné složky, kde už migrované jsou.
  - ⚠️ **PODMÍNKA, na které to stojí: žádný avatar nesmí sdílet soubor s jinou kolekcí.**
    Migrované avatary sdílené s `media` proto byly z knihovny médií odstraněny (záznamy, ne
    soubory — u `media` je konfigurace `boolean`, takže mazání dokumentu soubor nechává být).
    Kdyby někdy vznikl sdílený soubor znovu, výměna profilovky by smazala soubor, který patří
    i druhé kolekci. Kontrola: `select count(*) from avatars a join media m on
m.cloudinary_public_id = a.cloudinary_public_id` musí vrátit 0.
  - Osiřelé avatary (fotka bez účtu, který by ji měl nastavenou) uklízel jednorázový doběh,
    dnes odstraněný; **na produkci jich je 0**. Kdyby se to opakovalo (souběh tří uložení
    profilovky), skript je v git historii — a než ho spustíš, ověř kontrolou výš, že žádný
    soubor není sdílený s `media`, protože mazání záznamu avataru maže i soubor.

- **Comments (Komentáře a recenze)**:
  - Komentáře k článkům a recenze k místům/turistickým cílům (stránkám) — rozlišené polem `type` (`comment` / `review`); recenze má navíc hvězdičkové hodnocení. Cíl je polymorfní vazba `relatedTo` (článek / stránka).
  - **Web**: pod každým článkem se v plné šířce zobrazuje výpis komentářů (**nejnovější vlákna nahoře**; odpovědi uvnitř vlákna chronologicky) + formulář. Data načítá `fetchArticleComments` (`src/lib/payload.ts`) a skládá je do **vláken**, vykreslují komponenty v `src/components/features/comments/`.
  - **Vlákna**: sebe-referenční pole `parentComment` (odpověď na jiný komentář). Zobrazují se s jednou úrovní odsazení + spojovací linkou; odpověď na odpověď spadne také pod kořen. Autor článku (shoda `author` s `createdBy`) má u svých komentářů štítek „autor".
  - **Vkládání z webu**: běží přes Server Action (`src/lib/comment-actions.ts`) a Local API s `overrideAccess: true` — kolekce má `create: isAdmin`, takže bezpečná pole (typ, stav, cíl, `parentComment`) vynucuje action. Tlačítko „Odpovědět" předá cíl → nové odpovědi mají skutečnou vazbu. Autor je anonymní (jen jméno); registrovaní autoři migrovaných komentářů se zobrazují přes virtuální `authorPublic` (bezpečná podmnožina — username + avatar).
  - **Anti-spam**: honeypot + rate-limit + heuristika odkazů, volitelně Cloudflare Turnstile (`src/lib/comment-spam.ts`, viz `TURNSTILE_*` proměnné výše).
  - **Recenze na webu**: na stránkách kategorie **Turistický cíl** se pod obsahem zobrazuje sekce recenzí: lišta „Byl jsi zde? Ohodnoť to!" s hvězdičkovým vstupem a sbaleným formulářem, výpis recenzí (**nejnovější nahoře**, hvězdičky + „Recenzováno: dd.MM.yyyy"). Detail cíle má navíc **hodnocení v hero vedle názvu** (na mobilu pod ním; odkaz na `#recenze`), v pravém sloupci **praktické informace** (adresa, oficiální web, mapa s pinem cíle přes `MapLibreMap height`, autor — vzdušné legacy rozložení bez rámečku), pod recenzemi pás **„Co dalšího vidět…"** se sousedními cíli (`fetchTouristPointSiblings`, zobrazuje se při více než 2 sousedech) a vydává **JSON-LD `TouristAttraction` + `LocalBusiness` s `AggregateRating`** a recenzemi (hvězdičky ve výsledcích vyhledávání; samotný `TouristAttraction` Google pro review snippets nepodporuje, proto dvojí `@type` — dřívější legacy mikrodata u výpisu recenzí byla odstraněna, Google je odmítal). Povinnou `address` (`PostalAddress`) k `LocalBusiness` skládáme z **hierarchie** (drobečky = země → … → město), ne z volného textu `detail.googleMapsAddress` — ten u poloviny cílů není adresa, ale jen název („Eiffelova věž"); cíl bez země zůstane jen `TouristAttraction` (bez hvězdiček, ale s validní značkou). Fotky v textu cíle mají stropovanou výšku (`poi-prose`). Spodní responzivní reklamní pruh (`LeaderboardAd`, legacy slot) se vykresluje na všech stránkách a článcích kromě homepage a statických stránek (viz Pages níže). Data načítá `fetchPageReviews` (`src/lib/payload.ts`, cache tag `page_reviews_<id>`), vkládání řeší Server Action `src/lib/review-actions.ts` (stejné anti-spam vrstvy jako komentáře; hodnocení 1–5 povinné), komponenty jsou v `src/components/features/reviews/`. Reklamní sloupec vpravo přepíná 300×250 / 300×600 podle počtu recenzí (jako legacy). Ve výpisu cílů na stránce místa („Co vidět…") se u každého cíle zobrazují vpravo vedle názvu hvězdičky (průměr zaokrouhlený na půl hvězdičky) s počtem recenzí — data dodává `fetchPageReviewStats` (jeden hromadný dotaz pro všechny cíle) — a pod názvem řádek s adresou (`detail.googleMapsAddress`) a oficiálním webem (`detail.website`); po rozbalení se vpravo u „Zobrazit méně" ukáže autor cíle (avatar + jméno z virtuálního `createdByPublic`, které se pro děti stránky tahá přes `PAGE_CHILDREN_SELECT`). Rozbalení cíle („Zobrazit více", klik na hodnocení, nebo kotva `#slug` v URL) ukáže pod textem i recenze cíle s formulářem přímo na stránce místa (`InlineReviews`): načítají se líně přes server action `getPageReviews` až po rozbalení, zobrazují se první 3 + „Zobrazit další" a formulář (vč. Turnstile) se otevírá až na kliknutí. Hvězdičky v liště „Byl jsi zde?" i u cílů bez recenzí („Ohodnoť jako první" vedle názvu) fungují jako přímý vstup — kliknutí otevře formulář s předvyplněným počtem hvězd (sdílená komponenta `StarInput`; plné šedé hvězdičky `StarRating` naopak jen zobrazují průměr).
  - **Odvozené hodnocení míst**: recenze se píšou **jen k turistickým cílům** (jako na legacy webu), ale **místa** hvězdičky přebírají z cílů pod sebou — průměr ze **všech jednotlivých recenzí** (ne průměr průměrů, takže cíl s 30 recenzemi váží víc než cíl s jednou). Zobrazí se v **hero vedle názvu** místa jako „N recenzí cílů" (odkaz na `#mista`, tedy výpis cílů — místo vlastní sekci recenzí nemá) a na **dlaždicích v „Co vidět"** pod názvem. Nárok má místo, které se v seznamu chová jako koncová dlaždice: buď pod sebou nemá další místa (Budapešť), nebo má zapnuté `stopDisplayingChildPlaces` (ostrov — pak se sečtou i cíle v jeho podřazených místech). **Země, regiony ani kontinenty hodnocení nemají nikde** (ani jako dlaždice v nadřazeném seznamu) — průměr přes celou zemi se vždy usadí kolem 4,5 a nenese informaci; kontinent se proto ani nepočítá (zkratka `!page.parent`, jinak by se zbytečně procházely děti všech zemí). Hranice **3 recenzí** brání tomu, aby místo s jedinou nadšenou recenzí vypadalo jako nejlépe hodnocená destinace webu (`MIN_DERIVED_PLACE_REVIEWS`); dlaždice samotných **cílů** naopak ukazují hvězdičky od první recenze jako všude jinde. Data dodává `fetchDerivedPlaceRatings` (`src/lib/payload.ts`): dávkové BFS po úrovních (jeden dotaz na úroveň stromu, ne na dlaždici) + hromadný `fetchPageReviewStats`. Hierarchie se jde po `parent`, **ne** prefixem `fullSlug` — místo se může z URL potomků vynechat (`includeInChildUrlPaths`), takže cesta potomka nemusí začínat cestou předka.
  - Data přenesl jednorázový migrační doběh z legacy MySQL databáze. Legacy web vlákna neměl — vazby odpovědí dopočítala kontextová analýza textů. Oba skripty jsou hotové a odstraněné (viz git historie); v adminu lze `parentComment` kdykoliv ručně upravit.

- **Měna a časové pásmo se DĚDÍ po předcích** (`fetchInheritedPlaceDetail`
  v `src/lib/payload.ts`): stránka s prázdným políčkem `detail.currencyCode` /
  `detail.timezone` si hodnotu vezme od **nejbližšího předka**, který ji má. Vyplňuje
  se proto jen u **země** a u skutečných **výjimek** (region s jinou měnou; ruská města
  v jiném pásmu). Dřív měla každá stránka vlastní kopii z migrace, takže po přechodu
  Chorvatska na euro zůstalo 148 stránek na HRK — a kurz u zrušené měny nejde spočítat,
  API ji už nekótuje. Seznam předků skládá `ancestorSlugsNearestFirst`
  (`src/lib/page-hierarchy.ts`) z uložených `breadcrumbs`, **ne z adresy**: předci
  s `includeInChildUrlPaths: false` (kontinenty, Karélie nad Kiži) v URL nejsou, a přitom
  právě u nich může být výjimka. Stránka bez uloženého řetězce (starý import, zápis
  přímým SQL) spadne na prefixy adresy, jinak by nezdědila nic. Zděděné pásmo krmí
  i kartu „Aktuální čas" v textu (blok Nice-to-know s prázdným políčkem).
  **Předci se čtou JEDNÍM dotazem pro všechno, co se dědí** — `fetchAncestorDocs`
  obsluhuje měnu, pásmo i akční nabídky (dřív měl každý svůj dotaz nad týmiž řádky),
  duplicitní adresu řeší pravidlem „vyhrává nejnižší id" a dotaz se pustí jen tehdy,
  když stránce něco chybí **a** zároveň to na ní jde vidět (panel u míst a cílů, kurz
  u Praktických informací, karta Nice-to-know kdekoli v textu).
  Políčka hlídá `src/fields/place-detail.ts`: pásmo musí být platné jméno z IANA
  (přes `Intl`, aby prošly i aliasy v datech jako `US/Alaska`), měna tři písmena ISO
  4217 a ukládá se velkými, kontinenty a rubriky musí zůstat prázdné, a **kopie
  stránky (Duplicate) začíná s prázdnými políčky**, aby duplikováním města znovu
  nevznikaly nadbytečné kopie. Validace není kosmetika: překlep na stránce země
  zhasne hodiny všem jejím potomkům a `LocalTime` chybu spolkne, takže se nikde
  neohlásí.
  **Kontinenty nechávej prázdné** — hodnota by se propsala do všech zemí pod nimi.
  U **Česka** to platí jen pro MĚNU (kurz CZK→CZK se nepočítá), pásmo `Europe/Prague`
  tam být musí, jinak přijde o hodiny 110 českých stránek. **Země s víc pásmy** drží
  na sobě referenční čas a výjimky mají jednotlivé oblasti — Rusko moskevský čas
  a k tomu Kurská Kosa (Kaliningrad), Jekatěrinburg, Omsk a Novosibirsk; USA východní
  čas a k tomu Aljaška, Kalifornie, Wyoming a Arizona (ta nemá letní čas, proto vlastní
  `America/Phoenix`; národní parky pásmo dědí od svého státu). Kdo přidá město v jiném
  pásmu (Chicago, Las Vegas), musí mu pásmo vyplnit — jinak zdědí referenční čas země,
  což je horší než žádné hodiny. Jednorázový úklid dat je v
  `scripts/cleanup-currency-timezone.sql` (`pnpm cleanup:place-detail`): idempotentní,
  zálohy do schématu **`zaloha`** (v `public` by se o cizí tabulku zasekl dev server),
  kromě polí maže i rozbitý duplikát norské stránky o jídle, který visel pod
  Portugalskem. Před spuštěním vždy `pg_dump` — obsah mazané stránky v záloze polí není.
  **Na produkci spustit ručně + `force-recreate cms`**; spuštěno tam 17. 8. 2026.

- **Sekce „Příprava do …“** (`src/components/layout/page/preparation-section.tsx`): na
  stránkách kategorie **Místo k navštívení** mezi „Co vidět“ a „Články a cestopisy“ (legacy
  parita s `_affiliate.gsp`). Pět karet: **Cestovní pojištění** (redirect `/go/pojisteni`
  — záměrně dočasný 302 s neutrálním názvem; od 14. 8. 2026 vede na **Klik.cz** přes síť
  CJ/VIVnetworks, starý web měl ePojištění.cz), **Zájezdy / Rezervace ubytování / Půjčení
  auta** (deep-linky destinace z pole `affiliate` v CMS, prázdné pole = obecný redirect
  `/go/zajezdy` atd.). **Obecné cíle všech /go/ redirectů jsou editovatelné v adminu**:
  globál Homepage → skupina „Připrav se na cestu" (route handlery je čtou přes
  `getAffiliateTargets` v `src/lib/affiliate.ts`; prázdné pole = výchozí odkaz z kódu
  tamtéž, takže smazáním hodnoty se nic nerozbije — proto redirecty NEJSOU
  v `next.config.mjs`, statický redirect by cíl zapekl do buildu). **Ubytování jde přes
  Booking na síti CJ**: přímý program Booking ukončil 20. 6. 2025 (staré `aid=` odkazy
  se načtou, ale provizi nenesou). Karta vede na vlastní redirect
  `/go/ubytovani[/cesta-na-bookingu]` (route handler, důvěryhodná adresa místo tracking
  domény CJ), který cestu zvaliduje (pevný vzor, host natvrdo booking.com — žádný open
  redirect) a pošle na CJ click-link přes `?url=` — ověřeno, že finální stránka nese
  živý `aid` + `cjevent`. Deep-link země bere `accommodationHref` z CMS adresy (mrtvé
  `aid`/`label` zahodí), bez deep-linku vede na homepage Bookingu.
  **Auta jdou přes DiscoverCars** (program Rentalcars skončil — Booking Holdings):
  vlastní redirect `/go/auta[/cesta]` (route handler, stejný vzor a validace jako
  ubytování) vede na `discovercars.com/cz/…?a_aid=aracz`. Staré Rentalcars adresy
  v CMS (`countryCode=XX`) překládá mapa `RENTALCARS_COUNTRY_TO_DISCOVERCARS`
  na stránky zemí (ověřeno proti webu 14. 8. 2026; US/RU/CV stránku nemají → homepage);
  nové adresy z jejich [Landing page generatoru](https://www.discovercars.com/landing-page-generator)
  (i města, např. `/cz/austria/vienna`) lze vkládat rovnou do CMS pole. **Přesné
  deep-linky doplnil jednorázový doběh** (`scripts/backfill-affiliate-links.ts`): každému
  místu našel stránku města/regionu přímo na webech partnerů (exonyma Vídeň→vienna, přepis
  bez diakritiky, Booking si chybné slugy opraví sám přesměrováním) a kde nebyla, zdědil
  odkaz rodiče — v adminu je tak vidět skutečný cíl. Země se určovala z názvu kořenové
  stránky, NE z legacy kódů (Egypt měl chybně `ec` = Ekvádor). **Doběh je hotový (dev
  i produkce, 14. 8. 2026) a skript odstraněný** — v případě potřeby ho najdeš v git
  historii, viz „Stará databáze" výše pro postup. Výsledek na produkci: 657 stránek,
  z toho 487 s přesnou stránkou města/regionu u Bookingu, 258 u DiscoverCars a 117
  lokalit u Invie; zbytek dědí zemi. Novým místům stačí vyplnit pole v adminu (nebo
  nechat prázdné — runtime spadne na odkaz země/obecný).
  **Zájezdy jdou přes Invii** (partnerský účet ověřen živý 14. 8. 2026, `aid=4745582`):
  deep-linky destinací (`invia.cz/dovolena/<země>[/<lokalita>]`, slugy česky — bez exonym;
  Invia neexistující lokalitu přesměruje na zemi, hit je jen přímé 200) obaluje karta
  redirectem `/go/zajezdy[/cesta]`, který doplní `aid` ze základního odkazu v adminu. **Homepage** má panel „Připrav se na cestu"
  (`homepage/preparation-section.tsx`, legacy parita s `affiliate--homepage`): 4 obecné
  karty bez Praktických informací a deep-linků, mezi „Co je nového" a „Tématy ke čtení";
  mřížku karet sdílí `PreparationCards`. Dále **Praktické
  informace** (interní, podbarvená; stejný zdroj odkazu jako karta v pravém panelu, vč.
  zdědění od předka). Partnerské odkazy mají `rel="nofollow sponsored"` a nadpis se skloňuje
  přes `detail.genitive`; ikony jsou originální legacy SVG (fill `currentColor`), jen brožura
  Praktických informací je zjednodušená náhrada za 129kB originál. Robots.txt vylučuje
  `/go/` z procházení. Na mobilu karty po dvou, Praktické informace přes celou šířku.

- **Panel „Praktické informace do …"** (`src/components/layout/page/practical-info-links.tsx`):
  na stránkách kategorie **Místo k navštívení** jako poslední sekce POD články (legacy
  parita s `_practicalInfo.gsp`). Řada až 8 ikon s odkazy na podstránky praktických
  informací (Počasí, Doprava, Vstup, Měna, Zdraví, Kultura, Jídlo, Ubytování): každá
  dlaždice hledá stránku své kategorie nejdřív mezi **vlastními dětmi**, jinak u dětí
  **nejbližšího předka s Praktickými informacemi** — stejný zdroj jako karta v pravém
  panelu, takže sekce nepřidává žádný dotaz do CMS. Dlaždice bez stránky se vynechá,
  bez jediné se nevykreslí ani sekce; kontinent (stránka bez rodiče) panel nemá.
  Nadpis skloňuje vlastníka praktických informací (`practicalInfoOwner`), ne aktuální
  stránku — Dubrovník s chorvatskými odkazy říká „do Chorvatska". Ikony sedí na kruhových
  podkladech v barvách karet sekce „Příprava do …" (podklad `#f3f6fa`, rámeček `#e0e8f1`,
  hover se stínem — volba uživatele 28. 8. 2026 z variant v artifactu). Ikony jsou
  originální legacy SVG (z `assets/images/information/` a base64 pozadí v kickstart.css,
  fill `currentColor`) v opticky vyvážených velikostech; silnice je glyph z SVG fontu
  Glyphicons.

- **Pages — statické stránky** (`O nás`, `Reklama`, `Podmínky užívání webu`; kategorie
  `Statická stránka`, odkazy z patičky):
  - Založil je jednorázový doběh spolu s obsahem patičky; ten je hotový a odstraněný, takže
    se stránky i patička dál upravují **v adminu** (patička je globál, stránky kolekce Pages).
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
  - **Duplicitní účty**: jeden ze spoluautorů měl na webu dva účty, takže se jeho práce
    dělila na dvě hromádky a v sekci „Náš tým" vypadal jako někdo, kdo skoro nic nenapsal.
    Sloučil je jednorázový doběh (dnes odstraněný, viz git historie): přepsal autorství
    veškerého obsahu na ponechaný účet, doplnil mu jméno, medailonek i avatar z rušeného
    a rušený smazal. Kdyby se to opakovalo, hodí se z něj dvě poučení — jde to přímým SQL
    v jedné transakci, protože `payload.update` nad publikovanou stránkou zakládá novou verzi
    a posouvá `updatedAt`; a seznam sloupců s autorstvím se musí ověřit proti **všem** cizím
    klíčům na `users`, jinak nová kolekce s `createdBy` tiše osiří.

- **Transactions (Feather transakce)**:
  - Interní účetní záznamy „pírek" (feather) přenesené z původního webu — čtení i správa jsou omezené pouze na administrátory.
  - Každý záznam nese kategorii (odměny za obsah, bonus, výběr), počet pírek v poli `amount` (**kladné = zisk, záporné = výběr**) a volitelnou vazbu `relatedTo` na stránku, článek nebo komentář.
  - Data přenesl jednorázový migrační doběh z legacy MySQL databáze; skript je odstraněný (viz poznámka o historickém obsahu v Quick Startu).

## Questions

If you have any issues or questions, reach out to the development team.
