-- Úklid měny a časového pásma po zavedení dědění po hierarchii předků.
--
-- Kontext: dřív měla každá stránka vlastní kopii měny i pásma (dědictví migrace
-- z Grails), takže Chorvatsko mělo EUR, ale 148 jeho stránek pořád HRK. Od
-- zavedení `fetchInheritedPlaceDetail` si stránka s prázdným políčkem hodnotu
-- zdědí od nejbližšího předka, který ji má — hodnota proto patří jen na ZEMI
-- a na skutečné výjimky (region s jinou měnou nebo pásmem).
--
-- Spuštěno v DEV 17. 8. 2026. Na produkci spustit stejně a POTOM přerecyklovat
-- kontejner cms (`docker compose up -d --force-recreate cms`), aby se zahodila
-- cache. Skript je idempotentní — opakované spuštění už nic nezmění.

BEGIN;

-- 0) Záloha původních hodnot. Obnova:
--    UPDATE pages p SET detail_currency_code = b.detail_currency_code,
--                       detail_timezone = b.detail_timezone
--    FROM pages_detail_backup b WHERE b.id = p.id;
--    `IF NOT EXISTS` je záměr: při opakovaném spuštění se záloha NEPŘEPÍŠE
--    už uklizenými hodnotami.
CREATE TABLE IF NOT EXISTS pages_detail_backup AS
SELECT id, full_slug, detail_currency_code, detail_timezone FROM pages;

CREATE TABLE IF NOT EXISTS pages_v_detail_backup AS
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

-- 3) Spojené království měnu nemělo — nesla ji jen Anglie, Skotsko, Wales
--    a Severní Irsko. Zdrojem pravdy je země, ty čtyři se smažou v kroku 5.
UPDATE pages SET detail_currency_code = 'GBP'
WHERE full_slug = '/spojene-kralovstvi' AND coalesce(TRIM(detail_currency_code), '') = '';

-- 4) Rusko: pásmo patří na jednotlivá města (země pokrývá 11 pásem). Na zemi
--    dáváme MOSKEVSKÝ čas (referenční čas Ruska), takže evropská část ho zdědí;
--    Kaliningrad a sibiřská města mají výjimku.
UPDATE pages SET detail_timezone = 'Europe/Moscow' WHERE full_slug = '/rusko';
UPDATE pages SET detail_timezone = 'Europe/Kaliningrad' WHERE full_slug = '/rusko/kurska-kosa';
UPDATE pages SET detail_timezone = 'Asia/Yekaterinburg' WHERE full_slug = '/rusko/jekaterinburg';
UPDATE pages SET detail_timezone = 'Asia/Omsk' WHERE full_slug = '/rusko/omsk';
UPDATE pages SET detail_timezone = 'Asia/Novosibirsk' WHERE full_slug = '/rusko/novosibirsk';

-- 5) Nadbytečné kopie: hodnota shodná s tou, kterou by stránka zdědila od
--    nejbližšího předka. Smazání NEMĚNÍ nic z toho, co web zobrazí.
CREATE TEMP TABLE inherited_now AS
WITH RECURSIVE chain AS (
  SELECT p.id AS page_id, p.parent_id AS anc_id, 1 AS depth
  FROM pages p WHERE p.parent_id IS NOT NULL
  UNION ALL
  SELECT c.page_id, a.parent_id, c.depth + 1
  FROM chain c JOIN pages a ON a.id = c.anc_id WHERE a.parent_id IS NOT NULL
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

-- 7) Poslední verze stránky (to, co admin nabídne při editaci) musí mít totéž,
--    jinak by uložení v adminu starou hodnotu vrátilo. Historické verze
--    necháváme být — jsou to snapshoty.
UPDATE _pages_v v
SET version_detail_currency_code = p.detail_currency_code,
    version_detail_timezone = p.detail_timezone
FROM pages p
WHERE v.parent_id = p.id AND v.latest = true;

COMMIT;

-- Kontrola po spuštění: obě „→ smazat" čísla musí být 0 a „jiná než u předka"
-- smí obsahovat jen skutečné výjimky (dnes 4 ruská pásma).
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
  SELECT NULLIF(TRIM(p.detail_currency_code), '') AS own_cur,
         NULLIF(TRIM(p.detail_timezone), '') AS own_tz,
         i.inh_currency, i.inh_timezone
  FROM pages p LEFT JOIN inh i ON i.page_id = p.id
)
SELECT 'MĚNA: shodná s předkem → smazat' AS pripad, count(*) FROM st WHERE own_cur IS NOT NULL AND own_cur = inh_currency
UNION ALL SELECT 'MĚNA: jiná než u předka', count(*) FROM st WHERE own_cur IS NOT NULL AND inh_currency IS NOT NULL AND own_cur <> inh_currency
UNION ALL SELECT 'PÁSMO: shodné s předkem → smazat', count(*) FROM st WHERE own_tz IS NOT NULL AND own_tz = inh_timezone
UNION ALL SELECT 'PÁSMO: jiné než u předka', count(*) FROM st WHERE own_tz IS NOT NULL AND inh_timezone IS NOT NULL AND own_tz <> inh_timezone;
