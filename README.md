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

## Questions

If you have any issues or questions, reach out to the development team.
