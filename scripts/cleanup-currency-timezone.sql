-- Úklid měny a časového pásma po zavedení dědění po hierarchii předků.
--
-- Kontext: dřív měla každá stránka vlastní kopii měny i pásma (dědictví migrace
-- z Grails), takže Chorvatsko mělo EUR, ale 148 jeho stránek pořád HRK. Od
-- zavedení `fetchInheritedPlaceDetail` si stránka s prázdným políčkem hodnotu
-- zdědí od nejbližšího předka, který ji má — hodnota proto patří jen na ZEMI
-- a na skutečné výjimky (region s jinou měnou nebo pásmem).
--
-- Spuštěno v DEV i na PRODUKCI 17. 8. 2026. Postup: pustit soubor a POTOM
-- přerecyklovat kontejner cms (`docker compose up -d --force-recreate cms`),
-- aby se zahodila cache. Obsah stránky, kterou krok 4c maže, v zálohách NENÍ —
-- před spuštěním proto vždy `pg_dump` celé databáze.
--
-- Idempotentní: opakované spuštění nic nezmění a NEPŘEPÍŠE pozdější ruční
-- opravy (všechny zápisy hodnot jsou podmíněné prázdným políčkem).
--
-- `ON_ERROR_STOP` je povinný: bez něj psql po chybě pokračuje, `COMMIT` se tiše
-- změní na ROLLBACK a skript skončí s návratovým kódem 0 — tedy „úspěch",
-- při kterém se nestalo nic.
\set ON_ERROR_STOP on

BEGIN;

-- 0) Záloha hodnot obou sloupců. Obnova (POZOR na oba kroky — bez druhého by
--    první uložení stránky v adminu vrácené hodnoty zase smazalo, protože admin
--    načítá poslední VERZI, ne řádek v `pages`):
--    UPDATE pages p SET detail_currency_code = b.detail_currency_code,
--                       detail_timezone = b.detail_timezone
--    FROM zaloha.pages_detail b WHERE b.id = p.id;
--    UPDATE _pages_v v SET version_detail_currency_code = p.detail_currency_code,
--                          version_detail_timezone = p.detail_timezone
--    FROM pages p WHERE v.parent_id = p.id AND v.latest = true;
--
--    Zálohy patří do schématu `zaloha`, NE do `public`: Payload v dev režimu
--    srovnává schéma podle kódu a na cizí tabulku `pages_*` v `public` se zasekne
--    na promptu „Accept warnings and push schema?" (stalo se 17. 8. 2026).
--    `IF NOT EXISTS` je záměr: při opakovaném spuštění se záloha NEPŘEPÍŠE
--    už uklizenými hodnotami.
CREATE SCHEMA IF NOT EXISTS zaloha;

CREATE TABLE IF NOT EXISTS zaloha.pages_detail AS
SELECT id, full_slug, detail_currency_code, detail_timezone FROM pages;

CREATE TABLE IF NOT EXISTS zaloha.pages_v_detail AS
SELECT id, parent_id, version_full_slug, version_detail_currency_code, version_detail_timezone
FROM _pages_v WHERE latest = true;

-- 1) Neplatné měny: HRK (Chorvatsko má od 2023 euro) a BYR (nahrazeno BYN).
--    POZOR: podle kódu měny lze mazat jen měnu, která nikde neplatí. NOK je
--    platná měna Norska — chybný je jen NOK na portugalské podstránce, proto se
--    maže adresně (jinak o měnu přijde celé Norsko).
UPDATE pages SET detail_currency_code = NULL
WHERE detail_currency_code IN ('HRK', 'BYR');

UPDATE pages SET detail_currency_code = NULL
WHERE full_slug = '/portugalsko/jidlo1726123756332' AND detail_currency_code = 'NOK';

-- 2) Dvě chybná časová pásma (překlepy z kopírování stránek).
UPDATE pages SET detail_timezone = NULL
WHERE (full_slug = '/chorvatsko/sibenik' AND detail_timezone = 'Europe/Skopje')
   OR (full_slug = '/portugalsko/jidlo1726123756332' AND detail_timezone = 'Europe/Oslo');

-- 3) Spojené království měnu ani pásmo nemělo — nesla je jen Anglie, Skotsko,
--    Wales a Severní Irsko. Zdrojem pravdy je země, ty čtyři se smažou v kroku 5.
--    (Bez pásma na zemi zůstávala stránka UK i její praktické informace bez hodin
--    a ta čtveřice si držela kopie navíc — přesně ta duplicita, kterou skript ruší.)
UPDATE pages SET detail_currency_code = 'GBP'
WHERE full_slug = '/spojene-kralovstvi' AND coalesce(TRIM(detail_currency_code), '') = '';
UPDATE pages SET detail_timezone = 'Europe/London'
WHERE full_slug = '/spojene-kralovstvi' AND coalesce(TRIM(detail_timezone), '') = '';

-- 3b) Zastaralá jména pásem (IANA je drží jen jako odkazy na kanonická).
--     `Europe/Belfast` je totéž co `Europe/London`, takže Severní Irsko není
--     výjimka, ale kopie — jen ji krok 5 kvůli jinému NÁZVU nepozná a kontrola
--     na konci by ji navždy hlásila jako devátou „výjimku". `US/Alaska` výjimka
--     je (Aljaška má vlastní čas), přepisujeme jen na kanonický název, ať je
--     seznam výjimek čitelný. Obě dvojice ověřené proti Intl — stejný čas i posun.
UPDATE pages SET detail_timezone = NULL
WHERE full_slug = '/severni-irsko' AND detail_timezone = 'Europe/Belfast';
UPDATE pages SET detail_timezone = 'America/Anchorage'
WHERE full_slug = '/usa/aljaska' AND detail_timezone = 'US/Alaska';

-- 4) Rusko: pásmo patří na jednotlivá města (země pokrývá 11 pásem). Na zemi
--    dáváme MOSKEVSKÝ čas (referenční čas Ruska), takže evropská část ho zdědí;
--    Kaliningrad a sibiřská města mají výjimku.
--
--    Všechny zápisy jsou podmíněné PRÁZDNÝM políčkem: bez podmínky by opakované
--    spuštění tiše přepsalo pozdější ruční opravu v adminu (třeba /usa změněné
--    z východního času na chicagský) a krok 5 by pak smazal i kopie u potomků,
--    které se s vrácenou hodnotou srovnaly.
UPDATE pages SET detail_timezone = 'Europe/Moscow'
WHERE full_slug = '/rusko' AND coalesce(TRIM(detail_timezone), '') = '';
UPDATE pages SET detail_timezone = 'Europe/Kaliningrad'
WHERE full_slug = '/rusko/kurska-kosa' AND coalesce(TRIM(detail_timezone), '') = '';
UPDATE pages SET detail_timezone = 'Asia/Yekaterinburg'
WHERE full_slug = '/rusko/jekaterinburg' AND coalesce(TRIM(detail_timezone), '') = '';
UPDATE pages SET detail_timezone = 'Asia/Omsk'
WHERE full_slug = '/rusko/omsk' AND coalesce(TRIM(detail_timezone), '') = '';
UPDATE pages SET detail_timezone = 'Asia/Novosibirsk'
WHERE full_slug = '/rusko/novosibirsk' AND coalesce(TRIM(detail_timezone), '') = '';

-- 4b) USA: pásmo drží jednotlivé státy — Aljaška, Kalifornie a Wyoming ho už mají
--     a Yellowstone, Yosemite, Death Valley, Cody nebo Jackson ho po nich dědí.
--     Chybí Arizona (nemá letní čas, proto vlastní pásmo Phoenix — dědí ho celý
--     Grand Canyon) a země: na /usa dáváme VÝCHODNÍ čas jako referenci, aby
--     hodiny měly i podstránky USA (Praktické informace, Počasí, Měna…).
--     POZOR: kdo přidá město v jiném pásmu (Chicago, Las Vegas), musí mu pásmo
--     vyplnit — jinak zdědí východní čas, což je horší než žádné hodiny.
UPDATE pages SET detail_timezone = 'America/New_York'
WHERE full_slug = '/usa' AND coalesce(TRIM(detail_timezone), '') = '';
UPDATE pages SET detail_timezone = 'America/Phoenix'
WHERE full_slug = '/usa/arizona' AND coalesce(TRIM(detail_timezone), '') = '';

-- 4c) Rozbitý duplikát: norská stránka o jídle omylem pod Portugalskem, se
--     zdvojenými odstavci, s norskou měnou i pásmem a s časovým razítkem ve
--     slugu (automatické přejmenování při srážce). Správnou stránku má Norsko
--     na /norsko/jidlo, tahle byla jen navíc — a odkazovala se z portugalských
--     praktických informací, takže návštěvníka poslala na text o norských rybách.
--     Verze mažeme ručně: FK `_pages_v.parent_id` je SET NULL, jinak by po
--     stránce zůstaly osiřelé verze.
--
--     NÁVRATU NENÍ: obsah stránky v zálohách ze kroku 0 není (ty drží jen měnu
--     a pásmo), takže jedinou pojistkou je `pg_dump` z hlavičky. Kaskádové cizí
--     klíče navíc smažou i vazby článků, komentářů/recenzí a transakcí, další
--     dva klíče (`pages.parent_id`, `articles.main_page_id`) jen vynulují —
--     z dítěte by se tak stala stránka nejvyšší úrovně. Před smazáním se proto
--     ověří, že na stránku nic nevisí; když ano, skript se zastaví.
DO $$
DECLARE
  cil integer;
  vazby integer;
BEGIN
  -- `FOR UPDATE` řádek zamkne do konce transakce, takže mezi kontrolu vazeb
  -- a mazání se nevejde souběžný zápis z adminu: pokus přidat sem podstránku
  -- nebo vazbu bude čekat. Bez zámku by kontrola prošla a mazání pak dítě
  -- odpojilo (parent_id na NULL = stránka nejvyšší úrovně) nebo vazbu smazalo.
  SELECT id INTO cil FROM pages WHERE full_slug = '/portugalsko/jidlo1726123756332' FOR UPDATE;
  IF cil IS NULL THEN RETURN; END IF;

  SELECT (SELECT count(*) FROM pages WHERE parent_id = cil)
       + (SELECT count(*) FROM articles WHERE main_page_id = cil)
       + (SELECT count(*) FROM articles_rels WHERE pages_id = cil)
       + (SELECT count(*) FROM comments_rels WHERE pages_id = cil)
       + (SELECT count(*) FROM transactions_rels WHERE pages_id = cil)
  INTO vazby;

  IF vazby > 0 THEN
    RAISE EXCEPTION 'Stránka % má % navazujících záznamů (děti, články, komentáře, transakce) — smazat ručně po kontrole.', cil, vazby;
  END IF;

  DELETE FROM _pages_v WHERE parent_id = cil;
  DELETE FROM pages WHERE id = cil;
END $$;

-- 5) Nadbytečné kopie: hodnota shodná s tou, kterou by stránka zdědila od
--    nejbližšího předka. Smazání NEMĚNÍ nic z toho, co web zobrazí.
--    `ON COMMIT DROP` je nutné: temp tabulka jinak přežije `COMMIT` a druhé
--    spuštění v TÉŽE psql session by skončilo na „relation already exists",
--    což celou transakci vrátí — a vypadá to jako úspěšný běh bez změn.
--    Omezení hloubky je pojistka proti smyčce v hierarchii (A→B→A): bez něj by
--    se rekurze zacyklila uvnitř transakce, která už drží zámky na `pages`.
CREATE TEMP TABLE inherited_now ON COMMIT DROP AS
WITH RECURSIVE chain AS (
  SELECT p.id AS page_id, p.parent_id AS anc_id, 1 AS depth
  FROM pages p WHERE p.parent_id IS NOT NULL
  UNION ALL
  SELECT c.page_id, a.parent_id, c.depth + 1
  FROM chain c JOIN pages a ON a.id = c.anc_id
  WHERE a.parent_id IS NOT NULL AND c.depth < 20
)
SELECT c.page_id,
  (ARRAY_AGG(NULLIF(TRIM(a.detail_currency_code), '') ORDER BY c.depth)
     FILTER (WHERE NULLIF(TRIM(a.detail_currency_code), '') IS NOT NULL))[1] AS inh_currency,
  (ARRAY_AGG(NULLIF(TRIM(a.detail_timezone), '') ORDER BY c.depth)
     FILTER (WHERE NULLIF(TRIM(a.detail_timezone), '') IS NOT NULL))[1] AS inh_timezone
FROM chain c JOIN pages a ON a.id = c.anc_id
GROUP BY c.page_id;

UPDATE pages p SET detail_currency_code = NULL
FROM inherited_now i
WHERE i.page_id = p.id
  AND NULLIF(TRIM(p.detail_currency_code), '') IS NOT NULL
  AND TRIM(p.detail_currency_code) = i.inh_currency;

UPDATE pages p SET detail_timezone = NULL
FROM inherited_now i
WHERE i.page_id = p.id
  AND NULLIF(TRIM(p.detail_timezone), '') IS NOT NULL
  AND TRIM(p.detail_timezone) = i.inh_timezone;

-- 6) Prázdné řetězce srovnat na NULL, ať se admin i dotazy chovají stejně.
UPDATE pages SET detail_currency_code = NULL
WHERE detail_currency_code IS NOT NULL AND TRIM(detail_currency_code) = '';
UPDATE pages SET detail_timezone = NULL
WHERE detail_timezone IS NOT NULL AND TRIM(detail_timezone) = '';

-- 7) Poslední PUBLIKOVANÁ verze stránky (to, co admin nabídne při editaci) musí
--    mít totéž, jinak by uložení v adminu starou hodnotu vrátilo. Historické
--    verze necháváme být — jsou to snapshoty.
--    Rozpracované drafty se ZÁMĚRNĚ nepřepisují: editor tam může mít vědomě jinou
--    hodnotu a tiše ji přepsat publikovanou by znamenalo sebrat mu neuloženou práci.
--    Podmínka na rozdílnost hodnot navíc drží počet zapsaných řádků na tom, co se
--    skutečně mění (jinak by se přepsalo všech 3 000 řádků při každém běhu).
UPDATE _pages_v v
SET version_detail_currency_code = p.detail_currency_code,
    version_detail_timezone = p.detail_timezone
FROM pages p
WHERE v.parent_id = p.id
  AND v.latest = true
  AND v.version__status = 'published'
  AND (v.version_detail_currency_code IS DISTINCT FROM p.detail_currency_code
       OR v.version_detail_timezone IS DISTINCT FROM p.detail_timezone);

COMMIT;

-- Kontrola po spuštění: „→ smazat" a poslední dvě čísla musí být 0, „jiná než
-- u předka" smí obsahovat jen skutečné výjimky (dnes 8 pásem: Kaliningrad,
-- Jekatěrinburg, Omsk, Novosibirsk, Arizona, Aljaška, Kalifornie, Wyoming)
-- a „nikde v řetězu" jen Česko a jeho místa (kurz CZK→CZK se nepočítá).
WITH RECURSIVE chain AS (
  SELECT p.id AS page_id, p.parent_id AS anc_id, 1 AS depth
  FROM pages p WHERE p.parent_id IS NOT NULL
  UNION ALL
  SELECT c.page_id, a.parent_id, c.depth + 1
  FROM chain c JOIN pages a ON a.id = c.anc_id WHERE a.parent_id IS NOT NULL
), inh AS (
  SELECT c.page_id,
    (ARRAY_AGG(NULLIF(TRIM(a.detail_currency_code), '') ORDER BY c.depth)
       FILTER (WHERE NULLIF(TRIM(a.detail_currency_code), '') IS NOT NULL))[1] AS inh_currency,
    (ARRAY_AGG(NULLIF(TRIM(a.detail_timezone), '') ORDER BY c.depth)
       FILTER (WHERE NULLIF(TRIM(a.detail_timezone), '') IS NOT NULL))[1] AS inh_timezone
  FROM chain c JOIN pages a ON a.id = c.anc_id GROUP BY c.page_id
), st AS (
  SELECT p.id, p.parent_id, p.category::text AS kategorie,
         NULLIF(TRIM(p.detail_currency_code), '') AS own_cur,
         NULLIF(TRIM(p.detail_timezone), '') AS own_tz,
         i.inh_currency, i.inh_timezone
  FROM pages p LEFT JOIN inh i ON i.page_id = p.id
)
SELECT 'MĚNA: shodná s předkem → smazat' AS pripad, count(*) FROM st WHERE own_cur IS NOT NULL AND own_cur = inh_currency
UNION ALL SELECT 'MĚNA: jiná než u předka', count(*) FROM st WHERE own_cur IS NOT NULL AND inh_currency IS NOT NULL AND own_cur <> inh_currency
UNION ALL SELECT 'PÁSMO: shodné s předkem → smazat', count(*) FROM st WHERE own_tz IS NOT NULL AND own_tz = inh_timezone
UNION ALL SELECT 'PÁSMO: jiné než u předka', count(*) FROM st WHERE own_tz IS NOT NULL AND inh_timezone IS NOT NULL AND own_tz <> inh_timezone
-- Dvě slepá místa předchozí verze kontroly. Obě čísla výš vyžadují hodnotu
-- u předka, takže neuvidí ani „hodnota nikde v řetězu" (celá země bez měny),
-- ani duplikáty pod PRÁZDNÝM předkem — a právě takhle jí uniklo Spojené
-- království se čtyřmi kopiemi pásma pod zemí, která žádné neměla.
UNION ALL SELECT 'MĚNA: nikde v řetězu (čekáme jen Česko a jeho místa)', count(*)
  FROM st WHERE own_cur IS NULL AND inh_currency IS NULL AND kategorie = 'Místo k navštívení' AND parent_id IS NOT NULL
-- Rodič musí mít sám rodiče: kontinenty jsou prázdné SCHVÁLNĚ, takže země pod
-- nimi nejsou duplicita, ale zdroj pravdy.
UNION ALL SELECT 'KOPIE pod prázdným předkem → doplnit hodnotu předkovi', count(*)
  FROM (SELECT s.parent_id FROM st s JOIN st predek ON predek.id = s.parent_id
        WHERE s.own_tz IS NOT NULL AND s.inh_timezone IS NULL AND predek.parent_id IS NOT NULL
        GROUP BY s.parent_id HAVING count(*) > 1) x
UNION ALL SELECT 'KOŘENY (kontinenty, rubriky) s hodnotou → musí být prázdné', count(*)
  FROM st WHERE parent_id IS NULL AND (own_cur IS NOT NULL OR own_tz IS NOT NULL);
