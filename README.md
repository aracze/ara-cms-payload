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

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Besides the database and
storage credentials, the following variables drive user-visible features:

| Variable                                                                                               | Required    | Used for                                                                            |
| ------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`                                                                      | For maps    | Google Maps on place pages (public — ships to the browser).                         |
| `OPENWEATHER_API_KEY`                                                                                  | For weather | Server-side key for the `/api/weather` endpoint (never exposed to the browser).     |
| `NEXT_PUBLIC_SITE_URL`                                                                                 | Recommended | Public site URL for the sitemap and canonical links (default `https://www.ara.cz`). |
| `NEXT_PUBLIC_PAYLOAD_BASE_URL`                                                                         | Recommended | Base URL used to build absolute image URLs (logos, avatars, social sharing).        |
| `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT`, `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT_2` | Optional    | Google AdSense units in article listings.                                           |
| `TURNSTILE_SITE_KEY`                                                                                   | Optional    | Cloudflare Turnstile site key for the article comment form (anti-spam).             |
| `TURNSTILE_SECRET_KEY`                                                                                 | Optional    | Cloudflare Turnstile secret key (server-side token verification).                   |

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

### Collections

- **Users (Správa uživatelů)**:
  - Slouží k autentizaci a autorizaci přístupu do administrace.
  - Výchozím identifikátorem je e-mail.
  - Kolekce je připravena na rozšíření o role (např. admin, editor) a další uživatelské údaje.
  - V administraci lze spravovat hesla a přístupové údaje.

- **Media (Správa souborů a obrázků)**:
  - Centrální úložiště pro všechny nahrané soubory.
  - **Alt text**: Každý obrázek vyžaduje vyplnění alternativního popisu pro lepší SEO a přístupnost.
  - **Veřejný přístup**: Kolekce je nastavena tak, aby byly nahrané soubory veřejně čitelné.
  - **Zpracování obrázků**: Podporuje automatické generování náhledů, ořezy a optimalizaci (poháněno knihovnou Sharp).
  - Podporuje definici fokusu (focal point) pro inteligentní ořezy.

- **Comments (Komentáře a recenze)**:
  - Komentáře k článkům a recenze k místům/turistickým cílům (stránkám) — rozlišené polem `type` (`comment` / `review`); recenze má navíc hvězdičkové hodnocení. Cíl je polymorfní vazba `relatedTo` (článek / stránka).
  - **Web**: pod každým článkem se v plné šířce zobrazuje výpis komentářů (**nejnovější vlákna nahoře**; odpovědi uvnitř vlákna chronologicky) + formulář. Data načítá `fetchArticleComments` (`src/lib/payload.ts`) a skládá je do **vláken**, vykreslují komponenty v `src/components/features/comments/`.
  - **Vlákna**: sebe-referenční pole `parentComment` (odpověď na jiný komentář). Zobrazují se s jednou úrovní odsazení + spojovací linkou; odpověď na odpověď spadne také pod kořen. Autor článku (shoda `author` s `createdBy`) má u svých komentářů štítek „autor".
  - **Vkládání z webu**: běží přes Server Action (`src/lib/comment-actions.ts`) a Local API s `overrideAccess: true` — kolekce má `create: isAdmin`, takže bezpečná pole (typ, stav, cíl, `parentComment`) vynucuje action. Tlačítko „Odpovědět" předá cíl → nové odpovědi mají skutečnou vazbu. Autor je anonymní (jen jméno); registrovaní autoři migrovaných komentářů se zobrazují přes virtuální `authorPublic` (bezpečná podmnožina — username + avatar).
  - **Anti-spam**: honeypot + rate-limit + heuristika odkazů, volitelně Cloudflare Turnstile (`src/lib/comment-spam.ts`, viz `TURNSTILE_*` proměnné výše).
  - **Recenze na webu**: na stránkách kategorie **Turistický cíl** se pod obsahem zobrazuje sekce recenzí: lišta „Byl jsi zde? Ohodnoť to!" s hvězdičkovým vstupem a sbaleným formulářem, výpis recenzí (**nejnovější nahoře**, hvězdičky + „Recenzováno: dd.MM.yyyy", mikrodata schema.org/Review). Detail cíle má navíc **hodnocení v hero vedle názvu** (na mobilu pod ním; odkaz na `#recenze`), v pravém sloupci **praktické informace** (adresa, oficiální web, mapa s pinem cíle přes `GoogleMap height`, autor — vzdušné legacy rozložení bez rámečku), pod recenzemi pás **„Co dalšího vidět…"** se sousedními cíli (`fetchTouristPointSiblings`, zobrazuje se při více než 2 sousedech) a vydává **JSON-LD `TouristAttraction` s `AggregateRating`** a recenzemi (hvězdičky ve výsledcích vyhledávání). Fotky v textu cíle mají stropovanou výšku (`poi-prose`). Spodní responzivní reklamní pruh (`LeaderboardAd`, legacy slot) se vykresluje na všech stránkách a článcích kromě homepage. Data načítá `fetchPageReviews` (`src/lib/payload.ts`, cache tag `page_reviews_<id>`), vkládání řeší Server Action `src/lib/review-actions.ts` (stejné anti-spam vrstvy jako komentáře; hodnocení 1–5 povinné), komponenty jsou v `src/components/features/reviews/`. Reklamní sloupec vpravo přepíná 300×250 / 300×600 podle počtu recenzí (jako legacy). Ve výpisu cílů na stránce místa („Co vidět…") se u každého cíle zobrazují vpravo vedle názvu hvězdičky (průměr zaokrouhlený na půl hvězdičky) s počtem recenzí — data dodává `fetchPageReviewStats` (jeden hromadný dotaz pro všechny cíle) — a pod názvem řádek s adresou (`detail.googleMapsAddress`) a oficiálním webem (`detail.website`); po rozbalení se vpravo u „Zobrazit méně" ukáže autor cíle (avatar + jméno z virtuálního `createdByPublic`, které se pro děti stránky tahá přes `PAGE_CHILDREN_SELECT`). Rozbalení cíle („Zobrazit více", klik na hodnocení, nebo kotva `#slug` v URL) ukáže pod textem i recenze cíle s formulářem přímo na stránce místa (`InlineReviews`): načítají se líně přes server action `getPageReviews` až po rozbalení, zobrazují se první 3 + „Zobrazit další" a formulář (vč. Turnstile) se otevírá až na kliknutí. Hvězdičky v liště „Byl jsi zde?" i u cílů bez recenzí („Ohodnoť jako první" vedle názvu) fungují jako přímý vstup — kliknutí otevře formulář s předvyplněným počtem hvězd (sdílená komponenta `StarInput`; plné šedé hvězdičky `StarRating` naopak jen zobrazují průměr).
  - Data se plní jednorázovým migračním skriptem `pnpm migrate:comments` z legacy MySQL databáze. Legacy web vlákna neměl — vazby odpovědí dopočítal `pnpm infer:replies` (kontextová analýza textů, `--apply` zapíše; ověřená mapa v `scripts/infer-comment-replies.ts`). V adminu lze `parentComment` kdykoliv ručně upravit.

- **Transactions (Feather transakce)**:
  - Interní účetní záznamy „pírek" (feather) přenesené z původního webu — čtení i správa jsou omezené pouze na administrátory.
  - Každý záznam nese kategorii (odměny za obsah, bonus, výběr), počet pírek v poli `amount` (**kladné = zisk, záporné = výběr**) a volitelnou vazbu `relatedTo` na stránku, článek nebo komentář.
  - Data se plní jednorázovým migračním skriptem `pnpm migrate:transactions` z legacy MySQL databáze (viz krok 4 v Quick Startu).

## Questions

If you have any issues or questions, reach out to the development team.
