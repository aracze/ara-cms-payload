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
   pnpm dev
   ```
5. **Access Admin**: Open `http://localhost:3000/admin` to create your first admin user.

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
