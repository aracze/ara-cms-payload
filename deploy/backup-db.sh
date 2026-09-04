#!/usr/bin/env bash
#
# Denní záloha produkční databáze `aracze` na Cloudflare R2.
#
# Spouští systemd timer `aracze-backup.timer` (denně ~01:30 UTC).
# Retence: lokálně 7 dní, na R2 denní 30 dní a měsíční (1. dne) 400 dní.
#
# Ruční běh:            /opt/aracze/backup-db.sh
# Ruční běh nasucho:    DRY_RUN=1 /opt/aracze/backup-db.sh
# Log:                  /opt/aracze/backups/zaloha.log
#
set -euo pipefail

# Vše se dá přepsat z prostředí — kvůli testování (viz `CONTAINER=neexistuje …`
# pro ověření, že chybový e-mail opravdu odchází).
ENV_FILE="${ENV_FILE:-/opt/aracze/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/aracze/backups}"
CONTAINER="${CONTAINER:-aracze-postgres-1}"
DB_NAME="${DB_NAME:-aracze}"
DB_USER="${DB_USER:-postgres}"
# Vlastní bucket s vlastním tokenem (`r2zal`), oddělený od médií — token od
# fotek na zálohy nedosáhne a naopak. Viz deploy/README.md.
REMOTE="${REMOTE:-r2zal:aracze-db-zalohy}"
KEEP_LOCAL_DAYS=7
KEEP_DAILY=30d
KEEP_MONTHLY=400d
MIN_SIZE_BYTES=$((1024 * 1024)) # dump menší než 1 MB = něco se pokazilo
LOG="$BACKUP_DIR/zaloha.log"
DRY_RUN="${DRY_RUN:-}"

# Dump obsahuje e-maily uživatelů a hashe hesel, takže nesmí být čitelný pro
# nikoho dalšího na stroji. `umask` platí pro nově zakládané soubory (dumpy,
# log), `chmod` srovná i adresář, který mohl vzniknout dřív s volnějšími právy.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')" "$*" | tee -a "$LOG"; }

# Při jakékoli chybě pošli e-mail — jinak by se rozbitá záloha tiše ztratila.
notify_failure() {
  local rc=$1 line=$2
  log "CHYBA: skript spadl na řádku $line (exit $rc)"
  local host user pass from
  host=$(sed -nE 's/^SMTP_HOST=["'"'"']?([^"'"'"']*)["'"'"']?$/\1/p' "$ENV_FILE" | head -1)
  user=$(sed -nE 's/^SMTP_USER=["'"'"']?([^"'"'"']*)["'"'"']?$/\1/p' "$ENV_FILE" | head -1)
  pass=$(sed -nE 's/^SMTP_PASSWORD=["'"'"']?([^"'"'"']*)["'"'"']?$/\1/p' "$ENV_FILE" | head -1)
  from=$(sed -nE 's/^SMTP_FROM=["'"'"']?([^"'"'"']*)["'"'"']?$/\1/p' "$ENV_FILE" | head -1)
  [ -n "$host" ] && [ -n "$pass" ] || { log "e-mail neposlán: chybí SMTP_* v $ENV_FILE"; return 0; }

  local mail
  mail=$(mktemp)
  {
    printf 'From: Zaloha ara.cz <%s>\n' "$from"
    printf 'To: %s\n' "$from"
    printf 'Subject: [ara.cz] ZALOHA DATABAZE SELHALA\n'
    printf 'Content-Type: text/plain; charset=utf-8\n\n'
    printf 'Denni zaloha produkcni databaze se nedokoncila.\n\n'
    printf 'Server: %s\nRadek skriptu: %s (exit %s)\n\n' "$(hostname)" "$line" "$rc"
    printf 'Poslednich 25 radku logu:\n\n'
    tail -25 "$LOG"
  } > "$mail"

  if curl --silent --show-error --ssl-reqd --max-time 60 \
    --url "smtps://$host:465" --user "$user:$pass" \
    --mail-from "$from" --mail-rcpt "$from" --upload-file "$mail" >> "$LOG" 2>&1
  then
    log "e-mail o chybě odeslán na $from"
  else
    log "e-mail o chybě se NEPODAŘILO poslat (viz řádky curl výše)"
  fi
  rm -f "$mail"
}
# Nedokončený dump musí zmizet — v seznamu záloh by vypadal jako platný.
# Když už ověření prošlo (`dump_ok`), soubor si necháme: selhalo jen nahrání
# nebo úklid a lokální kopie je v pořádku.
cleanup_partial() {
  [ -n "${dump:-}" ] && [ -e "${dump:-}" ] && [ -z "${dump_ok:-}" ] || return 0
  rm -f "$dump"
  log "neověřený dump smazán: $dump"
}
# `exit $rc` je podstatné: bez něj by skript mohl skončit nulou a systemd
# by rozbitou zálohu nahlásil jako úspěšnou.
trap 'rc=$?; cleanup_partial; notify_failure $rc $LINENO; exit $rc' ERR

# Když skript zabije systemd (timeout) nebo Ctrl+C, ERR trap se NESPUSTÍ —
# bez tohohle by po sobě nechal neověřený dump a nikdo by se nic nedozvěděl.
trap 'rc=143; log "PŘERUŠENO signálem"; cleanup_partial; notify_failure $rc $LINENO; exit $rc' TERM INT

# Vlastní kontroly hlásí chyby TUDY, ne přes `exit 1`. Samotné `exit` totiž
# ERR trap nespouští (ověřeno), takže by se přeskočil úklid i e-mail —
# a to zrovna u případů, kde na nich záleží nejvíc (nekompletní dump).
fail() {
  log "$1"
  cleanup_partial
  notify_failure 1 "${BASH_LINENO[0]}"
  exit 1
}

stamp=$(date -u +%Y%m%d-%H%M)
dump="$BACKUP_DIR/aracze-$stamp.dump"

log "== start zálohy =="

# Po restartu serveru běží tato služba hned, jak je nahoře Docker — ale
# kontejner s databází ještě přijímat spojení nemusí (`Persistent=true` navíc
# dohání zálohu zmeškanou během vypnutí). Bez čekání by první záloha po
# restartu selhala a poslala planý poplach. Platí i pro ruční spuštění.
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" -q < /dev/null 2>/dev/null; then
    [ "$i" -gt 1 ] && log "databáze připravená po $((i * 2)) s"
    break
  fi
  [ "$i" -lt 30 ] || fail "databáze v kontejneru $CONTAINER nenaběhla ani po 60 s"
  sleep 2
done

# 1) Dump. `< /dev/null` je pojistka, aby si docker exec nebral stdin skriptu.
docker exec "$CONTAINER" pg_dump -Fc -U "$DB_USER" "$DB_NAME" > "$dump" < /dev/null
size=$(stat -c %s "$dump")
log "dump hotov: $dump ($(numfmt --to=iec "$size"))"

# 2) Ověření, že dump je čitelný a není odseknutý. Bez tohoto kroku by se
#    nepovedená záloha nahrála na R2 a vypadala jako v pořádku.
[ "$size" -ge "$MIN_SIZE_BYTES" ] || fail "dump je podezřele malý ($size B)"
# Kolik tabulek má dump obsahovat, se ptáme ŽIVÉ databáze — pevné číslo by
# zastaralo při každé nové kolekci. Tolerance 10 % kryje běh během migrace.
live=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
  "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace \
   where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema')" < /dev/null)
tables=$(docker exec -i "$CONTAINER" pg_restore --list < "$dump" | grep -c 'TABLE DATA' || true)
[ "$((tables * 10))" -ge "$((live * 9))" ] \
  || fail "dump má jen $tables tabulek, databáze jich má $live — nedůvěryhodné"
dump_ok=1
log "ověřeno: dump je čitelný, $tables tabulek s daty (databáze má $live)"

if [ -n "$DRY_RUN" ]; then
  log "DRY_RUN — přeskakuji nahrání na R2 i mazání; dump nechávám na disku"
  exit 0
fi

# 3) Nahrání na R2 — denní vždy, měsíční 1. dne (ta má vlastní delší retenci).
#
# `--s3-no-head` je POVINNÉ: rclone si po nahrání objekt zpětně načte dotazem
# s `?versionId=`, což R2 neumí (501 Not Implemented) — první pokus pak vždy
# selže a projde až druhý. Protože tím vypínáme rclonovou vlastní kontrolu,
# ověřujeme velikost na R2 sami (funkce `upload`).
RCLONE_OPTS=(--s3-no-check-bucket --s3-no-head)

upload() {
  local src=$1 dest=$2 local_size remote_size
  rclone copyto "$src" "$dest" "${RCLONE_OPTS[@]}"
  local_size=$(stat -c %s "$src")
  remote_size=$(rclone lsjson "$dest" "${RCLONE_OPTS[@]}" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["Size"])')
  [ "$remote_size" = "$local_size" ] \
    || fail "na R2 dorazilo $remote_size B místo $local_size B — $dest"
  log "nahráno a ověřeno ($(numfmt --to=iec "$remote_size")): $dest"
}

upload "$dump" "$REMOTE/denni/aracze-$stamp.dump"
if [ "$(date -u +%d)" = "01" ]; then
  upload "$dump" "$REMOTE/mesicni/aracze-$(date -u +%Y%m).dump"
fi

# 4) Retence. Lokálně mažeme jen naše `aracze-*.dump` — ruční zálohy
#    s jiným jménem zůstávají ležet.
find "$BACKUP_DIR" -maxdepth 1 -name 'aracze-*.dump' -mtime "+$KEEP_LOCAL_DAYS" -print -delete \
  | sed 's/^/  smazáno lokálně: /' | tee -a "$LOG"
rclone delete "$REMOTE/denni" --min-age "$KEEP_DAILY" "${RCLONE_OPTS[@]}"
rclone delete "$REMOTE/mesicni" --min-age "$KEEP_MONTHLY" "${RCLONE_OPTS[@]}"

remote_daily=$(rclone size "$REMOTE/denni" --json "${RCLONE_OPTS[@]}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['count'], 'záloh,', round(d['bytes'] / 1e6), 'MB')")
log "stav na R2: denní $remote_daily"
log "== záloha OK =="

# Log nenecháme růst do nekonečna.
if [ "$(stat -c %s "$LOG")" -gt $((2 * 1024 * 1024)) ]; then
  tail -2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
