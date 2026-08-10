# Nasazení aracze — návod

Architektura: **GitHub Actions** sestaví Docker obrazy → nahraje do **ghcr.io** →
přihlásí se přes SSH na **server** a spustí novou verzi. Server nic nebuilduje,
jen stahuje hotové obrazy.

```text
 push do main ─▶ GitHub Actions ─▶ build obrazu ─▶ ghcr.io ─▶ SSH deploy ─▶ server
```

Na serveru běží 3 kontejnery: `postgres`, `cms` (sloučená Next.js appka —
veřejný web i administrace v jednom obraze) a `caddy` (reverzní proxy, která
jako jediná kouká ven a ukončuje TLS).

- Web: `https://ara.cz/`
- Admin CMS: `https://ara.cz/admin`

Web je dostupný jen přes doménu (skrz Cloudflare). Holá IP obsah neservíruje —
Caddy má jen bloky pro `ara.cz`/`www.ara.cz`.

---

## 1) Co nastavit v GitHubu

Repozitář `aracze` → Settings → Secrets and variables → Actions.

**Secrets** (tajné):

| Název            | Hodnota                                        |
| ---------------- | ---------------------------------------------- |
| `DEPLOY_HOST`    | `217.154.225.117`                              |
| `DEPLOY_USER`    | `deploy` (uživatel pro nasazování, viz krok 2) |
| `DEPLOY_SSH_KEY` | privátní SSH klíč pro nasazování (celý obsah)  |

**Variables** (veřejné `NEXT_PUBLIC_*` — Next.js je zapéká do klientského bundlu
už PŘI BUILDU, proto musí být tady, ne jen v serverovém `.env`):

| Název                                                                    | Hodnota                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                                   | `https://ara.cz`                                            |
| `NEXT_PUBLIC_PAYLOAD_BASE_URL`                                           | `https://ara.cz` (stejné jako web)                          |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`                                        | klíč pro mapy (v Google Cloud omez přes "HTTP referrer")    |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`                                         | Map ID (Cloud Console → Map Management) pro nový typ značky |
| `NEXT_PUBLIC_ADSENSE_CLIENT` / `..._ARTICLE_SLOT` / `..._ARTICLE_SLOT_2` | AdSense (nepovinné)                                         |

> Obrazy do ghcr.io se pushují automaticky pomocí vestavěného `GITHUB_TOKEN`,
> žádný další token pro push není potřeba.

**E-maily (SMTP) — běhové proměnné, ne GitHub Variables.** E-maily z administrace
(reset hesla) posílá Payload přes SMTP. Tyto hodnoty NEjsou `NEXT_PUBLIC_*` (do
prohlížeče nesmí), proto se nezapékají při buildu, ale nastavují se za běhu v
serverovém `/opt/aracze/.env` (viz krok 2). Bez `SMTP_HOST` se e-maily jen vypíšou
do logu. Původní web používal Zoho:

```dotenv
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_USER=info@ara.cz
SMTP_PASSWORD=<heslo_schranky>
SMTP_FROM=info@ara.cz
```

---

## 2) Příprava serveru (jednorázově)

```bash
# a) Swap (POTŘEBA) — build sice běží v GitHub Actions, ALE Next.js appka (cms)
#    + PostgreSQL na 1,8 GB RAM mají paměťové špičky a bez swapu dochází k OOM
#    (systém zabije proces). 3 GB swap to spolehlivě řeší.
fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

# b) Docker
curl -fsSL https://get.docker.com | sh

# c) Firewall — ven jde jen 80 a 443 (obojí obsluhuje Caddy); 3000 zůstává zavřený.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# d) Uživatel pro nasazování + přístup k Dockeru
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# sem vlož VEŘEJNÝ deploy klíč:
# echo "ssh-ed25519 AAAA... deploy" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# e) Přihlášení serveru do ghcr.io (kvůli stahování privátních obrazů)
#    Vytvoř si na GitHubu token (classic) s právem `read:packages`.
echo "<GITHUB_TOKEN>" | docker login ghcr.io -u <github-uzivatel> --password-stdin

# f) Deploy adresář
mkdir -p /opt/aracze
```

Nahraj `docker-compose.yml` a `.env` do `/opt/aracze/`:

```bash
# z počítače:
scp deploy/docker-compose.yml deploy/Caddyfile deploy/.env root@217.154.225.117:/opt/aracze/
```

**Certifikát pro Caddy.** V Cloudflare → SSL/TLS → Origin Server → _Create
Certificate_ (výchozí volby: `ara.cz` + `*.ara.cz`, RSA, 15 let). Privátní klíč
se ukáže jen jednou. Obojí ulož na server — do gitu NEPATŘÍ:

```bash
mkdir -p /opt/aracze/certs
# vlož Origin Certificate → /opt/aracze/certs/origin.pem
# vlož Private Key       → /opt/aracze/certs/origin.key
chmod 600 /opt/aracze/certs/origin.key
```

Pak v Cloudflare přepni **SSL/TLS → Full (strict)**. Ověření, že origin mluví
HTTPS a certifikát projde (spustit z počítače):

```bash
curl -sI --resolve ara.cz:443:217.154.225.117 \
  --cacert <(curl -s https://developers.cloudflare.com/ssl/static/origin_ca_rsa_root.pem) \
  https://ara.cz | head -1     # očekává se HTTP/2 200
```

`.env` vytvoř z `.env.example` a doplň hodnoty (silná hesla vygeneruj příkazy
uvedenými v komentářích souboru).

---

## 3) První nasazení

```bash
cd /opt/aracze
docker compose pull
docker compose up -d
```

**Inicializace schématu.** V produkci `prodMigrations` standardně NEBĚŽÍ — Payload
by na schématu importovaném z dumpu (viz 3b) detekoval drift a start by zamrzl.
Schéma nastav jednou ze dvou cest:

- **Přenos dat z lokálu (doporučeno, viz 3b):** naimportuj dump z lokální DB —
  přinese schéma i data najednou.
- **Čistý deploy bez dumpu (migrace):** v `/opt/aracze/.env` nastav
  `PAYLOAD_RUN_MIGRATIONS=true` a restartuj `cms`. Payload při startu spustí
  migrace ze `src/migrations`. Ověření v logu:

  ```bash
  docker compose logs cms | grep -i migrat   # "Migrated: ..._initial"
  ```

Pak otevři `https://ara.cz/admin` — Payload nabídne **vytvoření
prvního administrátora**. Tím je CMS připravené.

> Pozn.: Při změně datového modelu vygeneruj migraci
> `pnpm payload migrate:create <nazev>` a commitni ji; při čistém deploy
> (`PAYLOAD_RUN_MIGRATIONS=true`) ji nasazená verze při startu doběhne, čímž se
> úplně prázdná DB postaví od nuly.

---

## 3b) Přenos dat z lokálního prostředí (nejlepší data jsou na locale)

Data se NEmigrují na serveru — vygeneruje se dump z lokální databáze a nahraje
do produkce. CMS má na to vestavěné endpointy (`pg_dump --format=c`, resp.
`pg_restore --clean`):

1. **Lokálně** vytvoř dump (endpoint `dbDump`) — stáhne soubor `.dump`.
2. Nahraj ho do produkce (endpoint `dbImport`) — ten provede `DROP SCHEMA` a
   obnoví lokální schéma i data.
3. Protože import přepíše schéma lokálním (bez záznamu o migraci), po importu
   označíme počáteční migraci jako provedenou, aby ji CMS při restartu
   nespouštěl znovu:

   ```bash
   docker compose exec -T postgres psql -U postgres -d aracze -c \
     "CREATE TABLE IF NOT EXISTS payload_migrations (id serial PRIMARY KEY, name varchar, batch numeric, updated_at timestamptz DEFAULT now() NOT NULL, created_at timestamptz DEFAULT now() NOT NULL); \
      INSERT INTO payload_migrations (name, batch) SELECT '20260709_134221_initial', 1 \
      WHERE NOT EXISTS (SELECT 1 FROM payload_migrations WHERE name = '20260709_134221_initial');"
   ```

> Tento krok proběhne jednou, až bude aplikace nasazená. Provedu ho s tebou.

## 4) Běžné nasazení další verze

Nic ručního — stačí pushnout do `main`. GitHub Actions obraz sestaví a sám ho
na serveru nasadí. Ruční varianta (kdyby bylo potřeba):

```bash
cd /opt/aracze && docker compose pull && docker compose up -d
```

---

## Poznámky / co vylepšit později

- **HTTPS**: ✅ hotovo (7. 8. 2026). Před appkou běží Caddy s certifikátem
  Cloudflare Origin CA (platnost do 2041, neobnovuje se), takže Cloudflare může
  jet v režimu Full (strict). Port 3000 se ven neotevírá — appka je dostupná
  jen skrz proxy. Doména na server míří od 8. 8. 2026; dočasný blok pro přístup
  přes holou IP byl z Caddyfile odstraněn 9. 8. 2026.
- **Vyhledávání**: index se staví za běhu z Payload Local API a obnovuje se
  automaticky při změně obsahu (revalidace cache tagů v hoocích) — žádný
  samostatný build/workflow už není potřeba.
- **Zálohy DB**: CMS má endpointy pro dump/import databáze; doporučuji nastavit
  pravidelnou zálohu volume `pgdata`.
