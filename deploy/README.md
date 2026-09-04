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
| `NEXT_PUBLIC_MEDIA_BASE_URL`                                             | `https://media.ara.cz` — media proxy (workers/media-proxy)  |

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
- **Zálohy DB**: ✅ hotovo (4. 9. 2026) — viz sekce „Zálohy databáze" níže.
  Kromě nich má CMS pořád endpointy pro ruční dump/import databáze v adminu.

---

## Zálohy databáze

Denní záloha na Cloudflare R2, nasazená 4. 9. 2026. Do té doby web žádnou
automatickou zálohu neměl — nejnovější byla ruční z 9. 8. 2026.

**Co kde je**

| Soubor v repu                          | Kam patří na server                    |
| -------------------------------------- | -------------------------------------- |
| `deploy/backup-db.sh`                  | `/opt/aracze/backup-db.sh` (práva 750) |
| `deploy/systemd/aracze-backup.service` | `/etc/systemd/system/`                 |
| `deploy/systemd/aracze-backup.timer`   | `/etc/systemd/system/`                 |

Nasazení nic z toho nekopíruje — po změně skriptu ho na server nahraj ručně
(stejně jako `docker-compose.yml` a `Caddyfile`).

**Jak to běží**

Timer `aracze-backup.timer` spustí skript denně v 01:30 UTC (rozptyl 15 min,
`Persistent=true` doběhne po startu, když byl server v tu dobu vypnutý). Skript:

1. udělá `pg_dump -Fc` z kontejneru `aracze-postgres-1` do `/opt/aracze/backups/`;
2. **ověří dump** — musí být čitelný pro `pg_restore --list`, mít aspoň 1 MB
   a obsahovat aspoň 90 % tabulek, které databáze právě má (počet se zjišťuje
   za běhu, aby pevné číslo nezastaralo s novou kolekcí);
3. nahraje ho na R2 a **porovná velikost** vzdáleného souboru s lokálním;
4. promaže staré zálohy podle retence.

**Retence**

| Kde                                     | Jak dlouho |
| --------------------------------------- | ---------- |
| lokálně `/opt/aracze/backups/`          | 7 dní      |
| R2 `db-zalohy/denni/`                   | 30 dní     |
| R2 `db-zalohy/mesicni/` (1. dne měsíce) | 400 dní    |

Dump má ~12 MB, celkem tedy ~0,5 GB, tj. ~5 % bezplatných 10 GB na R2.

**Když se záloha nepovede**, přijde e-mail na `SMTP_FROM` (info@ara.cz)
s posledními 25 řádky logu a skript skončí nenulovým kódem, takže selhání
uvidíš i v `systemctl status aracze-backup.service`. Neověřený dump se maže,
aby v seznamu záloh nevypadal jako platný. Platí to i pro **přerušení
signálem** (timeout ze systemd, Ctrl+C) a pro **vlastní kontroly** skriptu —
ty hlásí chyby přes funkci `fail()`, protože samotné `exit 1` v bashi ERR trap
nespustí, takže by se úklid i e-mail přeskočily.

Dump obsahuje e-maily uživatelů a hashe hesel, proto má `/opt/aracze/backups/`
práva 700 a soubory v něm 600 (skript si nastavuje `umask 077`).

Hlášení o chybě nesmí záviset na tom, co se právě rozbilo, proto:

- adresář se zakládá **až po** instalaci trapů — i „nejde založit `$BACKUP_DIR`"
  (plný disk, špatná práva) tak pošle e-mail;
- `log()` píše vždy na stdout (pod systemd ho sbírá journal) a do souboru jen
  když to jde;
- výstup `curl`u jde do `/tmp`, ne do `$LOG` — přesměrování do nedostupného
  adresáře by selhalo a curl by se vůbec nespustil;
- čekání na databázi má **dva** limity a oba jsou potřeba: `timeout 10` na jeden
  pokus (samotné `docker exec` se umí zaseknout na nereagujícím démonu) a k tomu
  celkový limit podle hodin (`READINESS_TIMEOUT`, výchozí 120 s). Jen ten první
  nestačí — n pokusů × timeout by se sečetlo do násobku inzerovaného limitu.

Zaseknutí v `pg_dump` nebo při nahrávání na R2 řeší `TimeoutStartSec=30min`
ze systemd: pošle `SIGTERM`, který skript odchytí, uklidí a ohlásí e-mailem.

**Ruční použití**

```bash
/opt/aracze/backup-db.sh                    # záloha hned
DRY_RUN=1 /opt/aracze/backup-db.sh          # jen dump + ověření, nic se nenahraje
READINESS_TIMEOUT=20 /opt/aracze/backup-db.sh  # kratší limit čekání na databázi
tail -30 /opt/aracze/backups/zaloha.log     # log
systemctl list-timers aracze-backup.timer   # kdy poběží příště
rclone lsl r2zal:aracze-db-zalohy/denni     # co je na R2
```

**Obnova ze zálohy** (ověřeno 4. 9. 2026 — počty řádků po obnově souhlasily
s produkcí). Nejdřív nanečisto do vedlejší databáze, ať nepřepíšeš ostrá data:

```bash
docker exec aracze-postgres-1 psql -U postgres -d postgres -c "create database zaloha_test"
docker exec -i aracze-postgres-1 pg_restore --dbname zaloha_test -U postgres \
  --no-owner --no-acl --single-transaction --exit-on-error < /opt/aracze/backups/<soubor>.dump
docker exec aracze-postgres-1 psql -U postgres -d zaloha_test -Atc "select count(*) from pages"
docker exec aracze-postgres-1 psql -U postgres -d postgres -c "drop database zaloha_test"
```

**Nastavení rclone** je v `/root/.config/rclone/rclone.conf` a má **dva remote**:

| Remote  | Bucket             | Klíče v `.env`                         | K čemu                |
| ------- | ------------------ | -------------------------------------- | --------------------- |
| `r2`    | `aracze`           | `S3_*`                                 | zrcadlo médií (appka) |
| `r2zal` | `aracze-db-zalohy` | `R2_ZALOHY_KEY_ID`, `R2_ZALOHY_SECRET` | zálohy databáze       |

Zálohy mají **vlastní bucket a vlastní token** (od 4. 9. 2026), aby klíč od médií
na ně nedosáhl a naopak — ověřeno: `rclone lsjson r2zal:aracze` vrací 403.
Token má práva jen _Object Read & Write_ na ten jeden bucket, `TTL: Forever`
(token s expirací by zálohy tiše zastavil) a **filtr na IP serveru**
`217.154.225.117` — stejný podepsaný požadavek vrací 200 ze serveru a 403 odjinud
(ověřeno). Server nemá IPv6, takže filtr na IPv4 stačí; **při změně IP serveru
je potřeba token v Cloudflare upravit**, jinak zálohy začnou selhávat.

Dvě pasti:

- `S3_ENDPOINT` v `.env` má bucket zapečený v cestě (`…r2.cloudflarestorage.com/aracze`).
  V rclone konfiguraci musí být **jen host**, jinak rclone hledá `aracze/aracze`.
- `--s3-no-head` je povinné: rclone si po nahrání objekt zpětně načte dotazem
  s `?versionId=`, což R2 neumí (501 Not Implemented) a první pokus vždy selže.
  Proto si velikost ověřuje sám skript.

**Co by šlo zlepšit**: zálohy leží u téhož poskytovatele jako web i média.
Proti ztrátě serveru chrání, proti ztrátě účtu u Cloudflare ne — druhá kopie
mimo Cloudflare (stažení k sobě nebo jiná služba) je zbylý nepokrytý risk.
