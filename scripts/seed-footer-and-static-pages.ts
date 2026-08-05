/**
 * Jednorázový doběh: naplní novou patičku a založí statické stránky, na které
 * odkazuje.
 *
 * PROČ: patička dosud odkazovala na pět stránek, z nichž v Payloadu existoval
 * jen `kontakt` — `o-nas`, `reklama`, `spoluprace`, `pirka` i odkaz na podmínky
 * vracely 404. Navíc měl copyright text natvrdo vepsaný HTML odkaz jako TEXT,
 * takže se na webu zobrazoval doslova jako `<a href="…">Podmínky…</a>`.
 *
 * CO DĚLÁ:
 *  1. založí (nebo přepíše) statické stránky `o-nas`, `reklama`
 *     a `podminky-uzivani-webu` obsahem převzatým ze starého Grails webu,
 *  2. přepíše globál `footer` — úvodní věta, kontakt, tři odkazy a krátký
 *     copyright bez rozbitého HTML.
 *
 * Spolupráce a Pírka se záměrně NEZAKLÁDAJÍ — ten systém v novém webu není.
 *
 * Skript je IDEMPOTENTNÍ: stránky hledá podle slugu a existující aktualizuje,
 * takže opakované spuštění vede vždy ke stejnému výsledku.
 * Spouští se přes `pnpm seed:footer`.
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'

// ── Pomocníci pro sestavení Lexical rich textu ──────────────────────────────
// Payload ukládá text jako Lexical JSON; ruční sestavení je čitelnější než
// tahat sem celý editor kvůli pár odstavcům.

type LexNode = Record<string, unknown>

const textNode = (text: string, bold = false): LexNode => ({
  type: 'text',
  detail: 0,
  format: bold ? 1 : 0,
  mode: 'normal',
  style: '',
  text,
  version: 1,
})

const linkNode = (text: string, url: string): LexNode => ({
  type: 'link',
  children: [textNode(text)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 3,
  fields: { linkType: 'custom', newTab: false, url },
})

const paragraph = (children: LexNode[]): LexNode => ({
  type: 'paragraph',
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  version: 1,
})

const p = (text: string) => paragraph([textNode(text)])

const heading = (text: string, tag: 'h2' | 'h3' = 'h2'): LexNode => ({
  type: 'heading',
  tag,
  children: [textNode(text)],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const listItem = (text: string, value: number): LexNode => ({
  type: 'listitem',
  children: [textNode(text)],
  direction: 'ltr',
  format: '',
  indent: 0,
  value,
  version: 1,
})

const bulletList = (items: string[]): LexNode => ({
  type: 'list',
  listType: 'bullet',
  tag: 'ul',
  start: 1,
  children: items.map((t, i) => listItem(t, i + 1)),
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

const doc = (children: LexNode[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

// ── Obsah stránek (převzato z ara.cz, zkráceno o neexistující sekce) ────────

/**
 * O nás — dva odstavce, nic víc.
 *
 * Původní text ze starého webu byl přepsaný: „ač se to nemusí zdát",
 * „předcházelo mnoho okolností" ani „Cestování samo o sobě má všechny tyto
 * aspekty" nenesly informaci, jen délku. Zůstal příběh (nápad 2011, spuštění
 * 2013, proč papoušek) a věta o tom, co web chce.
 *
 * Sekci o lidech tu ZÁMĚRNĚ nenajdeš: „Náš tým" pod textem vykresluje
 * komponenta TeamSection z živých dat profilů (fotka, jméno, medailonek, počty
 * příspěvků) — viz src/components/layout/page/team-section.tsx. Kdyby se sem
 * jména napsala ručně, byla by na webu dvakrát a čísla by rychle zastarala.
 */
const O_NAS = doc([
  p(
    'Nápad na cestovatelský portál přišel už v roce 2011 a o dva roky později web Ara.cz vzlétl. Papoušek ara v sobě má volnost, exotiku i dobrodružství — přesně jako cestování.',
  ),
  p(
    'Od začátku chceme jedno: inspirovat a psát o cestování přehledně a čtivě, aby si každý odnesl z cest ten nejlepší zážitek.',
  ),
])

const REKLAMA = doc([
  p(
    'Web provozujeme s láskou k cestování a ke čtenářům, proto není našim cílem zahltit web reklamou. Přesto máme rádi reklamu a rádi se s Vámi domluvíme na jakékoliv formě propagace. Jedinou podmínkou je, že produkt či služba musí mít vztah k cestování.',
  ),
  heading('Důvody proč inzerovat na portále Ara.cz?'),
  bulletList([
    'Jedná se o moderní cestovatelský web s dlouhodobou historií a širokým povědomím na českém trhu.',
    'Web není zahlcený reklamou a udržuje si vysokou kvalitu u vyhledávačů, kterou rádi smysluplně sdílíme.',
    'Jsme ochotni se domluvit na jakékoliv formě propagace a do určité míry přizpůsobení webu reklamě za příznivou cenu.',
    'Díky zkušenostem v internetové agentuře Vám poradíme, jak udělat kampaň na internetu účinnou.',
  ]),
  heading('Kontakt pro další informace'),
  paragraph([
    textNode('Pro více informací či získání statistik webu kontaktujte Jana Konáše na e-mailu '),
    linkNode('info@ara.cz', 'mailto:info@ara.cz'),
    textNode(' s předmětem zprávy „Zájem o inzerci na webu Ara.cz“.'),
  ]),
  paragraph([textNode('Upozornění: ', true), textNode('nemáme zájem o vzájemnou výměnu odkazů.')]),
])

/**
 * Podmínky užívání webu — přepracovaná verze původního textu z roku 2015.
 *
 * PROČ SE PŘEPISOVAL: původní text byl místy neplatný a místy nepravdivý.
 *  · opíral se o zákon č. 101/2000 Sb., který byl v roce 2019 ZRUŠEN (dnes
 *    platí GDPR + zákon č. 110/2019 Sb.),
 *  · sliboval zpracování osobních údajů „po dobu neurčitou“, což GDPR zakazuje,
 *  · nechával uživatele vzdát se osobnostních autorských práv — podle § 11
 *    odst. 4 autorského zákona se jich vzdát NELZE, takže to bylo neplatné,
 *  · odkazoval na varování „vlády Spojeného království“ (pozůstatek překladu
 *    cizích podmínek) místo českého MZV,
 *  · u cookies stavěl na mlčky předpokládaném souhlasu, přestože od 1. 1. 2022
 *    vyžaduje § 89 odst. 3 zákona č. 127/2005 Sb. aktivní souhlas,
 *  · odkazoval na neexistující „čl. 8.4“ a chyběl mu mechanismus podle DSA
 *    (nařízení EU 2022/2065) i výčet práv subjektu údajů.
 *
 * Části o zpracování údajů popisují SKUTEČNÉ chování aplikace (ověřeno v kódu):
 * IP adresa se drží jen v paměti pro rate-limit a nikam se neukládá; při smazání
 * účtu příspěvky zůstávají odpojené od účtu a profilová fotka se maže i ze
 * storage. Tyto věty je nutné přepsat, kdyby se chování změnilo.
 */
const PODMINKY = doc([
  p(
    'Tyto podmínky popisují pravidla, za kterých můžeš používat cestovatelský web Ara.cz — co na něm smíš dělat, komu patří obsah, jak nakládáme s tvými osobními údaji a co dělat, když se ti něco nezdá. Používáním webu s nimi vyslovuješ souhlas. Pokud s nimi nesouhlasíš, web prosím nepoužívej.',
  ),

  heading('Kdo web provozuje'),
  p(
    'Web Ara.cz provozuje Jan Konáš, fyzická osoba podnikající podle živnostenského zákona, IČO 02617641, se sídlem Lipanská 781/10, 130 00 Praha 3 – Žižkov, zapsaná v živnostenském rejstříku.',
  ),
  paragraph([
    textNode('Ve všech záležitostech nás zastihneš na e-mailu '),
    linkNode('info@ara.cz', 'mailto:info@ara.cz'),
    textNode('; na zprávy odpovídáme, jak nám čas dovolí.'),
  ]),

  heading('Změny podmínek'),
  p(
    'Podmínky můžeme v budoucnu upravit — třeba když přidáme novou funkci nebo se změní zákony. Aktuální verze je vždy na této stránce a je opatřená datem účinnosti. Podstatné změny oznámíme registrovaným uživatelům e-mailem alespoň 14 dní předem. Pokud web používáš i po jejich účinnosti, platí pro tebe nová verze.',
  ),

  heading('Uživatelský účet'),
  p(
    'Účet není k prohlížení webu potřeba — zakládá se jen tehdy, když chceš přispívat. Při registraci uvádíš pravdivé údaje a přihlašovací údaje nesdílíš s nikým dalším. Za činnost pod svým účtem odpovídáš ty; pokud máš podezření, že se do něj dostal někdo jiný, dej nám vědět.',
  ),
  p(
    'Účet si můžeš kdykoli smazat v nastavení. Smazání odstraní tvůj profil a profilovou fotku. Komentáře a recenze zůstanou zveřejněné, ale odpojí se od účtu — při mazání si volíš, jestli u nich zůstane tvoje jméno, nebo se nahradí označením anonymního autora. Zůstávají proto, že jejich odstraněním by v diskusích vznikly díry a zmizely by i odpovědi ostatních lidí.',
  ),

  heading('Obsah webu a autorská práva'),
  p(
    'Texty, fotografie, data o místech, mapy a grafika na webu jsou chráněné autorským právem. Bez našeho písemného souhlasu je nesmíš kopírovat, šířit ani z nich vytvářet odvozená díla, a to ani zčásti. O souhlas si můžeš napsat — u rozumných žádostí (citace, odkaz, školní práce) se většinou domluvíme.',
  ),
  p(
    'Automatizovaný sběr obsahu (roboti, scrapery, hromadné stahování) je bez písemného souhlasu zakázaný — stejně jako jakékoli jednání, které web nepřiměřeně zatěžuje.',
  ),

  heading('Obsah, který vkládáš ty'),
  p(
    'Autorem svých komentářů, recenzí, fotografií a textů zůstáváš ty. Jejich vložením nám dáváš nevýhradní, bezplatnou a časově neomezenou licenci k tomu, abychom je zveřejnili na webu a použili při jeho propagaci, včetně práva poskytnout podlicenci. Licence platí i po smazání účtu, protože příspěvky na webu zůstávají.',
  ),
  p(
    'Vložením obsahu potvrzuješ, že k němu máš potřebná práva — že fotografie jsou tvoje a text jsi nezkopíroval odjinud. Osobnostních autorských práv se nevzdáváš; česká úprava to ani neumožňuje. Souhlasíš jen s tím, že příspěvek zveřejníme pod tvým uživatelským jménem a můžeme v něm provést drobné redakční úpravy (překlepy, formátování), které nezmění jeho smysl.',
  ),

  heading('Co na web nepatří'),
  p('Nevkládej obsah, který:'),
  bulletList([
    'je nezákonný, podvodný, klamavý nebo pomlouvačný;',
    'uráží, zastrašuje nebo obtěžuje konkrétní lidi;',
    'podněcuje k nenávisti nebo násilí vůči skupině či jednotlivci;',
    'porušuje autorská práva, práva k ochranné známce nebo obchodní tajemství někoho jiného;',
    'vydává tebe za někoho jiného, nebo předstírá vztah k osobě či firmě, který neexistuje;',
    'obsahuje osobní údaje třetích osob bez jejich souhlasu (adresy, telefonní čísla, e-maily);',
    'je reklama, spam, řetězový e-mail nebo politická kampaň;',
    'obsahuje škodlivý kód.',
  ]),

  heading('Moderace'),
  p(
    'Příspěvky nečteme předem a nemáme povinnost je průběžně kontrolovat. Vyhrazujeme si ale právo obsah, který porušuje tyto podmínky nebo zákon, odstranit a v opakovaných případech omezit či zrušit účet. U odstranění na základě oznámení tě o důvodu informujeme, pokud známe tvůj kontakt.',
  ),
  p(
    'Za obsah vložený uživateli neodpovídáme — odpovídá za něj ten, kdo ho vložil. Doporučujeme si důležité příspěvky zálohovat; neručíme za to, že budou na webu dostupné trvale.',
  ),

  heading('Oznámení nezákonného obsahu'),
  paragraph([
    textNode(
      'Pokud na webu narazíš na obsah, který podle tebe porušuje zákon nebo tvá práva, napiš nám na ',
    ),
    linkNode('info@ara.cz', 'mailto:info@ara.cz'),
    textNode(
      '. Do zprávy prosím uveď odkaz na konkrétní místo, důvod oznámení a kontakt na sebe. Oznámení posoudíme bez zbytečného odkladu, o výsledku ti dáme vědět a v odůvodněných případech obsah odstraníme. Proti našemu rozhodnutí se můžeš stejnou cestou odvolat. Tento postup naplňuje povinnosti podle nařízení EU 2022/2065 o digitálních službách.',
    ),
  ]),

  heading('Odkazy na jiné weby'),
  p(
    'Web obsahuje odkazy na stránky, které neprovozujeme — weby úřadů, dopravců, ubytování a podobně. Jejich obsah ani nakládání s osobními údaji neovlivňujeme a neodpovídáme za ně. Uvedení odkazu neznamená, že daný web nebo službu doporučujeme.',
  ),

  heading('Informace o cestování'),
  p(
    'Obsah webu je informativní. Snažíme se ho udržovat aktuální, ale podmínky vstupu, ceny, jízdní řády ani bezpečnostní situace se nemění podle nás — před cestou si vždy ověř aktuální informace u oficiálních zdrojů.',
  ),
  paragraph([
    textNode(
      'To platí především u vstupních podmínek a bezpečnosti. Doporučujeme sledovat aktuální doporučení Ministerstva zahraničních věcí ČR na ',
    ),
    linkNode('mzv.gov.cz', 'https://www.mzv.gov.cz/'),
    textNode(
      '. Tím, že o nějaké destinaci píšeme, netvrdíme, že je cesta do ní bezpečná nebo doporučená, a neodpovídáme za škody vzniklé v souvislosti s tvou cestou.',
    ),
  ]),

  heading('Ochrana osobních údajů'),
  p(
    'Správcem osobních údajů je provozovatel webu (viz výše). Údaje zpracováváme podle nařízení EU 2016/679 (GDPR) a zákona č. 110/2019 Sb.',
  ),

  heading('Jaké údaje zpracováváme a proč', 'h3'),
  bulletList([
    'E-mail a heslo — abys mohl mít účet a přihlásit se. Heslo ukládáme jen v zašifrované podobě, nikdo z nás ho nevidí. Právní základ: plnění smlouvy o poskytování služby.',
    'Uživatelské jméno — podepisuje tvoje příspěvky a je veřejné. Právní základ: plnění smlouvy.',
    'Nepovinné údaje profilu (jméno, popis o sobě, odkaz na vlastní web, profilová fotka) — vyplňuješ je jen když chceš a jsou veřejné. Právní základ: tvůj souhlas, který můžeš vzít zpět jejich smazáním.',
    'Obsah tvých příspěvků — zveřejňujeme ho na webu. Právní základ: plnění smlouvy.',
    'IP adresa — používáme ji výhradně k omezení počtu příspěvků z jednoho místa, aby web nezavalil spam. Drží se pouze v provozní paměti serveru po dobu řádu minut a do databáze se neukládá. Právní základ: náš oprávněný zájem na ochraně webu.',
  ]),

  heading('Jak dlouho je uchováváme', 'h3'),
  p(
    'Údaje o účtu zpracováváme, dokud účet trvá. Po jeho smazání profil zaniká; ze zálohových kopií databáze zmizí nejpozději do 30 dnů. Zveřejněné příspěvky zůstávají na webu odpojené od účtu (viz část o účtu výše). E-mailovou komunikaci s tebou si ponecháváme nejdéle rok.',
  ),

  heading('Komu se údaje dostanou', 'h3'),
  p(
    'Osobní údaje neprodáváme a nepředáváme nikomu pro marketingové účely. K technickému provozu webu využíváme tyto zpracovatele:',
  ),
  bulletList([
    'Cloudinary — ukládání a doručování obrázků včetně profilových fotek;',
    'Cloudflare — záložní úložiště obrázků a ochrana registračního formuláře proti robotům (Turnstile);',
    'OpenFreeMap — mapové podklady; při zobrazení mapy se k nim dostane tvoje IP adresa;',
    'Zoho — odesílání e-mailů z webu (potvrzení registrace, obnova hesla);',
    'poskytovatel serveru, na kterém web běží.',
  ]),
  p(
    'Zvlášť stojí reklama: dáš-li souhlas s reklamními cookies, získá údaje o tvém chování na webu společnost Google jako samostatný správce — podrobnosti jsou v části o reklamě níže.',
  ),
  p(
    'Údaje můžeme dále poskytnout, pokud nám to ukládá zákon nebo o ně požádá soud či orgán činný v trestním řízení.',
  ),

  heading('Tvá práva', 'h3'),
  p(
    'Máš právo vědět, jaké údaje o tobě máme, dostat jejich kopii, nechat je opravit nebo smazat, omezit jejich zpracování, vznést proti zpracování námitku, přenést je jinam a vzít zpět souhlas tam, kde na něm zpracování stojí. Napiš nám a vyřídíme to nejpozději do měsíce, zdarma.',
  ),
  paragraph([
    textNode(
      'Pokud budeš mít pocit, že s tvými údaji nakládáme špatně, řekni nám to prosím jako první — a pokud to nevyřešíme, můžeš podat stížnost u Úřadu pro ochranu osobních údajů, ',
    ),
    linkNode('uoou.gov.cz', 'https://www.uoou.gov.cz/'),
    textNode('.'),
  ]),

  heading('Cookies'),
  p(
    'Cookies dělíme na dvě skupiny, se kterými se zachází jinak. Nastavení souhlasu můžeš kdykoli změnit v liště, která se ti zobrazí při první návštěvě, nebo si cookies smazat přímo v prohlížeči.',
  ),

  heading('Nezbytné cookies', 'h3'),
  p(
    'Web ukládá přihlašovací cookie, která drží tvoje přihlášení, aby ses nemusel hlásit na každé stránce znovu. Bez ní by přihlášení nefungovalo, takže patří mezi technicky nezbytné a souhlas pro ni zákon nevyžaduje. Zmizí odhlášením nebo vymazáním údajů v prohlížeči.',
  ),

  heading('Reklamní cookies', 'h3'),
  p(
    'Provoz webu financujeme reklamou od služby Google AdSense. Ta pro výběr a měření reklamy ukládá do tvého prohlížeče vlastní cookies a může tvoje chování na webu vyhodnocovat, aby ti zobrazovala relevantnější reklamu.',
  ),
  p(
    'Tyto cookies se nastaví POUZE tehdy, když k nim dáš souhlas v liště při první návštěvě. Pokud souhlas nedáš, reklama se ti bude zobrazovat neprofilovaná — o obsah webu nepřijdeš. Souhlas můžeš kdykoli odvolat, aniž by to mělo jakýkoli následek.',
  ),

  heading('Reklama a Google'),
  p(
    'Dáš-li souhlas s reklamními cookies, stává se společnost Google Ireland Limited samostatným správcem údajů, které tímto způsobem získá — my k nim nemáme přístup a neovlivňujeme, jak s nimi zachází. Údaje mohou být zpracovávány i mimo Evropskou unii, zejména ve Spojených státech; Google je pro tyto přenosy certifikován v rámci rámce EU–USA pro ochranu osobních údajů.',
  ),
  paragraph([
    textNode('Podrobnosti o tom, jak Google reklamní data zpracovává, najdeš v jeho '),
    linkNode('zásadách ochrany soukromí', 'https://policies.google.com/technologies/partner-sites'),
    textNode('. Zobrazování personalizované reklamy si můžeš vypnout i v '),
    linkNode('nastavení reklam Google', 'https://adssettings.google.com/'),
    textNode('.'),
  ]),
  p(
    'Reklamu odlišujeme od redakčního obsahu. Inzerenty nevybíráme podle toho, kdo jsi, a redakční obsah se za peníze neupravuje.',
  ),

  heading('Odpovědnost'),
  p(
    'Web poskytujeme, jak stojí a leží, a bez záruky nepřerušené dostupnosti. Neodpovídáme za škodu vzniklou tím, že web nebyl dostupný, že v obsahu byla chyba nebo že jsi se rozhodl podle informací, které jsi na něm našel. Tím nejsou dotčena tvá práva spotřebitele ani odpovědnost za škodu způsobenou úmyslně či z hrubé nedbalosti, kterou podle zákona vyloučit nelze.',
  ),

  heading('Řešení sporů'),
  p(
    'Vztahy z těchto podmínek se řídí právem České republiky, zejména občanským zákoníkem. Kdyby mezi námi vznikl spor, zkusme ho nejdřív vyřešit dohodou — napiš nám.',
  ),
  paragraph([
    textNode(
      'Jsi-li spotřebitel, můžeš se s návrhem na mimosoudní řešení sporu obrátit na Českou obchodní inspekci, ',
    ),
    linkNode('adr.coi.cz', 'https://adr.coi.cz/'),
    textNode('. Toto řešení je pro tebe bezplatné a nic tě nezavazuje obracet se na soud.'),
  ]),

  heading('Závěrečná ustanovení'),
  p(
    'Pokud se některé ustanovení těchto podmínek ukáže jako neplatné, ostatní zůstávají v platnosti.',
  ),
  p('Tyto podmínky jsou účinné od 5. 8. 2026 a nahrazují předchozí verzi z 1. 1. 2015.'),
])

// Bez odkazu na podmínky — ten je v liště o pár pixelů vedle.
const COPYRIGHT = doc([p('© 2013–2026 Ara.cz · Obsah nelze šířit bez písemného souhlasu.')])

const PAGES = [
  { slug: 'o-nas', title: 'O nás', text: O_NAS },
  { slug: 'reklama', title: 'Reklama', text: REKLAMA },
  { slug: 'podminky-uzivani-webu', title: 'Podmínky užívání webu', text: PODMINKY },
]

// ── Doběh ───────────────────────────────────────────────────────────────────

const payload = await getPayload({ config })

for (const page of PAGES) {
  const existing = await payload.find({
    collection: 'pages',
    where: { slug: { equals: page.slug } },
    limit: 1,
    depth: 0,
  })

  const data = {
    title: page.title,
    slug: page.slug,
    category: 'Statická stránka' as const,
    text: page.text,
    _status: 'published' as const,
  }

  if (existing.docs.length > 0) {
    await payload.update({ collection: 'pages', id: existing.docs[0].id, data })
    console.log(`aktualizováno: /${page.slug}`)
  } else {
    await payload.create({ collection: 'pages', data })
    console.log(`založeno:      /${page.slug}`)
  }
}

// Kontakt zrušen: e-mail je nově přímo v patičce, takže stránka s jedinou
// větou („Máte dotaz nebo námět? Napište nám…“) už neměla co říct navíc.
const kontakt = await payload.find({
  collection: 'pages',
  where: { slug: { equals: 'kontakt' } },
  limit: 1,
  depth: 0,
})
if (kontakt.docs.length > 0) {
  await payload.delete({ collection: 'pages', id: kontakt.docs[0].id })
  console.log('smazáno:       /kontakt')
}

await payload.updateGlobal({
  slug: 'footer',
  data: {
    lede: 'Rádi uslyšíme tvůj názor na naše stránky, ať je dobrý nebo špatný.',
    // Kontaktní osoba se v patičce záměrně neuvádí — kdo web píše, říká
    // stránka „O nás“ s kontextem. Vyplněním `personName` se řádek vrátí.
    contact: {
      email: 'info@ara.cz',
      personName: null,
      personHref: null,
    },
    navItems: [
      { label: 'O nás', href: '/o-nas' },
      { label: 'Reklama', href: '/reklama' },
      { label: 'Podmínky užívání webu', href: '/podminky-uzivani-webu' },
    ],
    copyrightText: COPYRIGHT,
  },
})
console.log('patička: aktualizována')

process.exit(0)
