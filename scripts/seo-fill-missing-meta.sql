-- Doplnění SEO titulku a popisku u stránek a článků, které je po migraci
-- z Grails neměly (10 stránek + 2 články, stav 30. 8. 2026). Texty psané ručně
-- ve znění ostatních popisků (viz src/lib/seo-templates.ts); web příponu
-- „| Ara.cz" přidává sám, proto tu není.
--
-- Idempotentní: přepisuje JEN prázdné hodnoty, takže opakované spuštění ani
-- pozdější ruční úprava v adminu nic nerozbije. Verze (_pages_v) dostanou
-- stejné hodnoty u aktuální verze — bez toho by admin po otevření stránky
-- ukázal prázdná pole a při uložení je vyprázdnil i na webu.
--
-- Spuštění (dev):  docker compose exec -T postgres psql -U postgres -d aracze < scripts/seo-fill-missing-meta.sql
-- Produkce: stejný soubor proti prod DB (viz README „Jednorázové doběhy proti
-- produkční databázi"), potom `docker compose up -d --force-recreate cms`
-- (cache dat).

BEGIN;

WITH fill (full_slug, meta_title, meta_description) AS (
  VALUES
    ('/ekvador/prakticke-informace',
     'Praktické informace při cestě do Ekvádoru',
     'Praktické informace před cestou do Ekvádoru: vstupní podmínky a víza, měna a ceny, zdraví a bezpečnost, doprava, jazyk a místní kultura.'),
    ('/myanmar/mount-popa',
     'Mount Popa – posvátná sopka a klášter Taung Kalat v Myanmaru',
     'Mount Popa je vyhaslá sopka a poutní místo v Myanmaru: na skalním vrcholu Taung Kalat stojí klášter, sídlo duchů nats, s výhledem do širé krajiny. Jak se tam dostat a co vidět.'),
    ('/norsko/jidlo',
     'Jídlo a pití v Norsku – co ochutnat a vyzkoušet',
     'Tradiční norská kuchyně: losos, sledě, treska, sobí maso, sýry a tmavé pečivo. Co ochutnat, kde se najíst levně a kolik stojí jídlo a pití v Norsku.'),
    ('/o-nas',
     'O nás – kdo píše cestovní průvodce Ara.cz',
     'Ara.cz je český cestovatelský portál, který vzlétl v roce 2013. Kdo za webem stojí, jak vznikají průvodce po zemích a městech a jak se můžeš zapojit.'),
    ('/podminky-uzivani-webu',
     'Podmínky užívání webu a ochrana osobních údajů',
     'Pravidla používání webu Ara.cz, autorská práva k textům a fotografiím, zpracování osobních údajů a cookies. Kdo web provozuje a kam se obrátit.'),
    ('/polsko/lodz/pohadkova-lodz-bajkowa',
     'Pohádková Lodž (Łódź Bajkowa) – sochy animovaných postav',
     'Pohádková Lodž: stezka soch postav z animovaných filmů studia Se-Ma-For po centru Lodže. Kde sochy stojí, jak si projít trasu a co vidět po cestě.'),
    ('/rady-na-cestu',
     'Rady na cestu – cestovní inspirace a tipy',
     'Štěstí při cestování přeje připraveným. Praktické rady, jak plánovat cestu, balit, šetřit a zvládnout cestování bez stresu – zkušenosti cestovatelů z Ara.cz.'),
    ('/reklama',
     'Reklama a spolupráce na Ara.cz',
     'Možnosti inzerce a propagace na cestovatelském portálu Ara.cz: bannery, články, partnerství. Pro produkty a služby se vztahem k cestování.'),
    ('/slovensko/zilina/marianske-namesti',
     'Mariánské náměstí v Žilině – historické centrum s podloubím',
     'Mariánské náměstí je historické jádro Žiliny a městská památková zóna: měšťanské domy s podloubím, kavárny a letní terasy. Historie, co vidět a tipy na návštěvu.'),
    ('/usa/grand-canyon/south-rim/bright-angel-trail',
     'Bright Angel Trail – trek do Grand Canyonu ze South Rimu',
     'Bright Angel Trail je nejvytíženější stezka do Grand Canyonu z Grand Canyon Village: odpočívadla, kemp Indian Garden a Plateau Point. Délka, náročnost a tipy na výstup.')
),
updated AS (
  UPDATE pages p
  SET meta_title = COALESCE(NULLIF(p.meta_title, ''), f.meta_title),
      meta_description = COALESCE(NULLIF(p.meta_description, ''), f.meta_description)
  FROM fill f
  WHERE p.full_slug = f.full_slug
    AND (COALESCE(p.meta_title, '') = '' OR COALESCE(p.meta_description, '') = '')
  RETURNING p.id, p.meta_title, p.meta_description
)
UPDATE _pages_v v
SET version_meta_title = u.meta_title,
    version_meta_description = u.meta_description
FROM updated u
WHERE v.parent_id = u.id
  AND v.latest = true;

UPDATE articles a
SET meta_title = COALESCE(NULLIF(a.meta_title, ''), v.meta_title),
    meta_description = COALESCE(NULLIF(a.meta_description, ''), v.meta_description)
FROM (
  VALUES
    ('top-aplikace-na-cestovani',
     'Top aplikace na cestování – překladače, mapy a plánování',
     'Nejlepší mobilní aplikace na cesty: Google Translate, offline mapy, plánování tras, ubytování a doprava. Které si stáhnout před odjezdem a proč.'),
    ('spoluprace',
     'Spolupráce – staň se cestovním průvodcem na Ara.cz',
     'Baví tě cestování a psaní? Přidávej recenze, nová místa a informace o svých oblíbených destinacích na Ara.cz a staň se oficiálním průvodcem místa.')
) AS v (slug, meta_title, meta_description)
WHERE a.slug = v.slug
  AND (COALESCE(a.meta_title, '') = '' OR COALESCE(a.meta_description, '') = '');

-- Kontrola: po doběhu má být 0.
SELECT 'pages_missing' AS what, count(*) FROM pages
 WHERE _status = 'published' AND (COALESCE(meta_title, '') = '' OR COALESCE(meta_description, '') = '')
UNION ALL
SELECT 'articles_missing', count(*) FROM articles
 WHERE COALESCE(meta_title, '') = '' OR COALESCE(meta_description, '') = '';

COMMIT;
