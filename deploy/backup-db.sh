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
READINESS_TIMEOUT="${READINESS_TIMEOUT:-120}" # kolik s celkem čekat na databázi
LOCKFILE="${LOCKFILE:-/run/aracze-backup.lock}"
LOG="$BACKUP_DIR/zaloha.log"
DRY_RUN="${DRY_RUN:-}"

# Hlášení jde VŽDY na stdout (pod systemd ho sbírá journal) a do souboru jen
# když to jde. Původní `| tee -a "$LOG"` by na nezapisovatelném adresáři vrátil
# nenulový kód, spustil ERR trap a hlášení o chybě by se tím samo utnulo.
# Monotonní sekundy (viz čekání na databázi níže) — `date +%s` skáče s NTP.
uptime_s() { awk '{print int($1)}' /proc/uptime; }

log() {
  local msg
  msg="$(date -u '+%Y-%m-%d %H:%M:%S UTC')  $*"
  # Obojí s `|| true`: kdyby byl stdout zavřený, `printf` vrátí nenulový kód
  # a pod `set -e` by se log() ukončil ještě před odesláním e-mailu.
  printf '%s\n' "$msg" || true
  printf '%s\n' "$msg" >> "$LOG" 2>/dev/null || true
}

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
    # `-f` místo `-r`: kdyby `$LOG` byl FIFO, `tail` by se na něm zablokoval
    # a e-mail by nikdy neodešel. `timeout` krytí i pro ostatní patologie.
    if ! { [ -f "$LOG" ] && timeout 5 tail -25 "$LOG" 2>/dev/null; }; then
      printf '(log %s nedostupny — viz `journalctl -u aracze-backup.service`)\n' "$LOG"
    fi
  } > "$mail"

  # Výstup curlu jde do /tmp, NE do `$LOG`. Kdyby byl `$BACKUP_DIR` nedostupný,
  # přesměrování `>> "$LOG"` by selhalo a curl by se vůbec nespustil — hlášení
  # o chybě by tiše nedorazilo právě v případě, kdy je nejpotřebnější.
  local curlout
  curlout=$(mktemp)
  if curl --silent --show-error --ssl-reqd --max-time 60 \
    --url "smtps://$host:465" --user "$user:$pass" \
    --mail-from "$from" --mail-rcpt "$from" --upload-file "$mail" > "$curlout" 2>&1
  then
    log "e-mail o chybě odeslán na $from"
  else
    log "e-mail o chybě se NEPODAŘILO poslat: $(tr '\n' ' ' < "$curlout" | cut -c1-300)"
  fi
  rm -f "$curlout"
  rm -f "$mail"
}
# Nedokončený dump musí zmizet — v seznamu záloh by vypadal jako platný.
# Když už ověření prošlo (`dump_ok`), soubor si necháme: selhalo jen nahrání
# nebo úklid a lokální kopie je v pořádku.
cleanup_partial() {
  # Tři podmínky, všechny nutné: soubor vytvořil TENTO běh (`dump_owned`),
  # ještě neprošel ověřením (`dump_ok`) a existuje. Bez `dump_owned` mohl
  # spadlý běh smazat platnou zálohu z JINÉHO běhu — což se 4. 9. 2026 při
  # testování skutečně stalo, protože značka měla rozlišení jen na minuty.
  [ -n "${dump_owned:-}" ] && [ -z "${dump_ok:-}" ] && [ -e "${dump:-}" ] || return 0
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

# Adresář se zakládá teprve TEĎ, až po instalaci trapů — kdyby to selhalo
# (plný disk, špatná práva), musí i o tom přijít e-mail. Dump obsahuje
# e-maily uživatelů a hashe hesel, proto `umask 077` pro nově zakládané
# soubory a `chmod 700` i na adresář, který mohl vzniknout dřív volnější.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Dvě zálohy zároveň nechceme: zdvojily by zátěž databáze a sahaly by si na
# tytéž soubory. Zámek je v `/run`, aby nezávisel na `$BACKUP_DIR`.
exec 9> "$LOCKFILE"
if ! flock -n 9; then
  log "jiná záloha už běží ($LOCKFILE) — končím bez chyby"
  exit 0
fi

# Sekundy jsou tu podstatné: se značkou na minuty dostanou dva běhy v téže
# minutě stejné jméno souboru (viz `dump_owned` u cleanup_partial).
stamp=$(date -u +%Y%m%d-%H%M%S)
dump="$BACKUP_DIR/aracze-$stamp.dump"

log "== start zálohy =="

# Po restartu serveru běží tato služba hned, jak je nahoře Docker — ale
# kontejner s databází ještě přijímat spojení nemusí (`Persistent=true` navíc
# dohání zálohu zmeškanou během vypnutí). Bez čekání by první záloha po
# restartu selhala a poslala planý poplach. Platí i pro ruční spuštění.
# Limit se drží podle HODIN, ne podle počtu pokusů. `timeout` na jeden pokus je
# nutný, protože `docker exec` se umí zaseknout (nereagující démon) — ale sám
# nestačí: n pokusů × timeout by se sečetlo do násobku inzerovaného limitu.
# Čas se bere z `/proc/uptime`, protože je MONOTONNÍ. `date +%s` je nástěnný
# čas a krok NTP krátce po startu serveru — přesně scénář, na který tohle
# čekání je (`Persistent=true`) — by deadline přeskočil: první neúspěšný
# pokus by po dvou sekundách ohlásil „nenaběhla ani po 120 s", poslal planý
# poplach a záloha by ten den neproběhla.
readiness_start=$(uptime_s)
readiness_deadline=$((readiness_start + READINESS_TIMEOUT))
while true; do
  # `--kill-after`: kdyby `docker exec` ignoroval SIGTERM, samotný `timeout`
  # by na něj čekal dál. Takhle dostane po dalších 5 s SIGKILL.
  if timeout --kill-after=5s 10s docker exec "$CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" -q < /dev/null 2>/dev/null; then
    waited=$(($(uptime_s) - readiness_start))
    [ "$waited" -gt 0 ] && log "databáze připravená po $waited s"
    break
  fi
  [ "$(uptime_s)" -lt "$readiness_deadline" ] \
    || fail "databáze v kontejneru $CONTAINER nenaběhla ani po $READINESS_TIMEOUT s"
  sleep 2
done

# 1) Dump. `< /dev/null` je pojistka, aby si docker exec nebral stdin skriptu.
#
# Jméno se zabírá ATOMICKY: `noclobber` dělá z `>` otevření s O_EXCL, takže
# „zkontroluj, jestli existuje" a „zaber" nejsou dva kroky, mezi které se vejde
# druhý běh. Zabrání je PŘED `dump_owned=1`, aby `fail` (a tím `cleanup_partial`)
# cizí soubor nesmazal.
set -o noclobber
if ! : > "$dump"; then
  fail "soubor $dump už existuje — neběží druhá záloha zároveň?"
fi
set +o noclobber
dump_owned=1
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
# Žádné `| tee -a "$LOG"` v rouře: s `pipefail` by neúspěšný zápis do logu
# shodil celý krok a poslal „ZALOHA SELHALA" po tom, co už je dump nahraný —
# a přeskočil by i retenci na R2 níž.
smazano=$(find "$BACKUP_DIR" -maxdepth 1 -name 'aracze-*.dump' -mtime "+$KEEP_LOCAL_DAYS" -print -delete | wc -l)
if [ "$smazano" -gt 0 ]; then
  log "lokálně smazáno starých záloh: $smazano"
fi
rclone delete "$REMOTE/denni" --min-age "$KEEP_DAILY" "${RCLONE_OPTS[@]}"
rclone delete "$REMOTE/mesicni" --min-age "$KEEP_MONTHLY" "${RCLONE_OPTS[@]}"

remote_daily=$(rclone size "$REMOTE/denni" --json "${RCLONE_OPTS[@]}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['count'], 'záloh,', round(d['bytes'] / 1e6), 'MB')")
log "stav na R2: denní $remote_daily"
log "== záloha OK =="

# Log nenecháme růst do nekonečna. Pozor: `tail` jako PRVNÍ člen `&&` listu
# nespustí ani `set -e`, ani ERR trap — a protože je tohle poslední příkaz
# skriptu, skončila by hotová záloha nenulovým kódem bez jediného hlášení.
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt $((2 * 1024 * 1024)) ]; then
  # Zkracuje se podle BAJTŮ, ne řádků: cíl je držet velikost, a jediný dlouhý
  # řádek (např. obří chybový výstup) by log nad limitem udržel navždy —
  # rotace by se pak spouštěla při každém běhu naprázdno. První řádek tím může
  # zůstat rozpůlený, což je u logu přijatelné.
  if tail -c 1000000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"; then
    log "log zkrácen na poslední ~1 MB"
  else
    rm -f "$LOG.tmp"
    log "rotaci logu se nepovedlo dokončit — na výsledek zálohy to nemá vliv"
  fi
fi

# Záloha je v tuhle chvíli hotová a ověřená; nic po ní už nesmí změnit
# návratový kód.
exit 0
