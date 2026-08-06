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
    'Nápad na cestovatelský portál přišel už v roce 2011 a o dva roky později web Ara.cz vzlétl. Papoušek ara v sobě nese volnost, exotiku i dobrodružství — přesně jako cestování.',
  ),
  p(
    'Od začátku chceme inspirovat a psát o cestování čtivě a přehledně, aby si každý mohl odnést z cest ten nejlepší zážitek.',
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
 * Podmínky užívání webu — osekané na to, co skutečně ukládá zákon, plus
 * několik vět, bez kterých by web přišel o oprávnění zveřejňovat a mazat
 * uživatelské příspěvky.
 *
 * PROČ SE PŘEPISOVALY: původní text z roku 2015 byl místy neplatný —
 * opíral se o zákon č. 101/2000 Sb. (zrušen 2019), sliboval zpracování údajů
 * „po dobu neurčitou“ (GDPR zakazuje), nechával uživatele vzdát se
 * osobnostních autorských práv (podle § 11 odst. 4 autorského zákona se jich
 * vzdát nelze, takové ujednání je neplatné), u cookies stavěl na mlčky
 * předpokládaném souhlasu (od 1. 1. 2022 vyžaduje § 89 odst. 3 zákona
 * č. 127/2005 Sb. souhlas aktivní) a odkazoval na varování „vlády Spojeného
 * království“ — pozůstatek překladu cizích podmínek.
 *
 * CO TU ZŮSTALO A PROČ:
 *  · identifikace provozovatele — povinná,
 *  · informace o zpracování údajů — GDPR čl. 13; dobu uložení uvádíme
 *    KRITÉRII (čl. 13 odst. 2 písm. a to výslovně připouští), ne čísly, která
 *    by nikdo nehlídal,
 *  · cookies — § 89 odst. 3 zákona č. 127/2005 Sb.,
 *  · oznamování nezákonného obsahu — čl. 16 DSA (nařízení EU 2022/2065).
 *    POZOR: výjimka pro mikropodniky v čl. 19 se týká JEN oddílu o online
 *    platformách (čl. 20–28), na čl. 16 se nevztahuje — ověřeno v textu
 *    nařízení, běžné shrnutí „malé podniky jsou vyňaty“ je zavádějící,
 *  · licence k příspěvkům a pravidla moderace — zákon je nevyžaduje, ale bez
 *    nich nemá web jasné právo cizí komentář zveřejnit ani smazat.
 *
 * Vypuštěno oproti delší verzi: samostatné oddíly o změnách podmínek, odkazech
 * na cizí weby, omezení odpovědnosti a salvátorská klauzule — buď to plyne ze
 * zákona i bez ujednání, nebo šlo o vatu.
 *
 * Části o údajích popisují SKUTEČNÉ chování aplikace (ověřeno v kódu): IP
 * adresa se drží jen v paměti pro rate-limit a do databáze nejde; při smazání
 * účtu příspěvky zůstávají odpojené a profilová fotka mizí i ze storage.
 * Kdyby se chování změnilo, musí se přepsat i tenhle text.
 */
const PODMINKY = doc([
  p(
    'Tyto podmínky shrnují pravidla používání webu Ara.cz a to, jak nakládáme s osobními údaji. Používáním webu s nimi souhlasíš.',
  ),

  heading('Kdo web provozuje'),
  p(
    'Provozovatelem webu a správcem osobních údajů je Jan Konáš, fyzická osoba podnikající podle živnostenského zákona, IČO 02617641, se sídlem Lipanská 781/10, 130 00 Praha 3 – Žižkov.',
  ),
  paragraph([
    textNode('Kontakt na všechno níže uvedené: '),
    linkNode('info@ara.cz', 'mailto:info@ara.cz'),
    textNode('.'),
  ]),

  heading('Obsah webu'),
  p(
    'Texty, fotografie, data o místech a grafika na webu jsou chráněné autorským právem. Bez našeho písemného souhlasu je nekopíruj ani nešiř, a to ani zčásti. O souhlas si napiš — u rozumných žádostí se domluvíme.',
  ),

  heading('Účet a příspěvky'),
  p(
    'Účet je potřeba jen k přispívání. Za činnost pod svým účtem odpovídáš ty. Smazat si ho můžeš kdykoli v nastavení: profil i profilová fotka zaniknou, komentáře a recenze zůstanou zveřejněné, ale odpojí se od účtu — při mazání volíš, jestli u nich zůstane tvoje jméno, nebo se nahradí anonymem. Zůstávají proto, aby v diskusích nevznikly díry a nezmizely odpovědi ostatních.',
  ),
  p(
    'Autorem svých příspěvků zůstáváš ty. Jejich vložením nám dáváš nevýhradní bezplatnou licenci je zveřejnit na webu a použít při jeho propagaci; licence platí i po smazání účtu, protože příspěvky na webu zůstávají. Osobnostních autorských práv se nevzdáváš, česká úprava to neumožňuje.',
  ),
  p(
    'Nevkládej obsah, který je nezákonný, klamavý, urážlivý nebo pomlouvačný, podněcuje k nenávisti, porušuje práva někoho jiného, obsahuje osobní údaje třetích osob bez jejich souhlasu, je reklamou nebo spamem. Takový obsah můžeme odstranit a při opakování omezit účet.',
  ),

  heading('Informace o cestování'),
  paragraph([
    textNode(
      'Obsah webu je informativní. Podmínky vstupu, ceny ani bezpečnostní situace se nemění podle nás — před cestou si vše ověř u oficiálních zdrojů, zejména v doporučeních Ministerstva zahraničních věcí ČR na ',
    ),
    linkNode('mzv.gov.cz', 'https://www.mzv.gov.cz/'),
    textNode('. Za škody vzniklé v souvislosti s tvou cestou neodpovídáme.'),
  ]),

  heading('Oznámení nezákonného obsahu'),
  paragraph([
    textNode('Narazíš-li na webu na obsah, který porušuje zákon nebo tvá práva, napiš nám na '),
    linkNode('info@ara.cz', 'mailto:info@ara.cz'),
    textNode(
      ' — uveď odkaz na konkrétní místo, důvod a kontakt na sebe. Oznámení posoudíme bez zbytečného odkladu, o výsledku tě vyrozumíme a v odůvodněných případech obsah odstraníme. Proti rozhodnutí se můžeš stejnou cestou odvolat.',
    ),
  ]),

  heading('Osobní údaje'),
  p('Údaje zpracováváme podle nařízení EU 2016/679 (GDPR) a zákona č. 110/2019 Sb.'),
  bulletList([
    'E-mail a heslo — pro vedení účtu a přihlášení; heslo ukládáme jen zašifrované. Právní základ: plnění smlouvy.',
    'Uživatelské jméno — podepisuje příspěvky a je veřejné. Právní základ: plnění smlouvy.',
    'Nepovinné údaje profilu (jméno, popis, odkaz na web, fotka) — vyplňuješ je dobrovolně a jsou veřejné. Právní základ: souhlas, který vezmeš zpět jejich smazáním.',
    'Obsah příspěvků — zveřejňujeme na webu. Právní základ: plnění smlouvy.',
    'IP adresa — jen pro omezení spamu; drží se v provozní paměti serveru řádově minuty a do databáze se neukládá. Právní základ: oprávněný zájem na ochraně webu.',
  ]),
  p(
    'Údaje o účtu zpracováváme, dokud účet trvá. Po smazání profil i fotka zanikají okamžitě, ze zálohových kopií údaje zmizí přepsáním zálohy běžnou rotací; zveřejněné příspěvky zůstávají odpojené od účtu. E-mailovou komunikaci si ponecháváme po dobu nezbytnou k vyřízení věci.',
  ),
  p(
    'Údaje neprodáváme. K provozu využíváme zpracovatele: Cloudinary (obrázky), Cloudflare (zálohy obrázků a ochrana formulářů proti robotům), OpenFreeMap (mapové podklady — dostane se k nim tvoje IP adresa), Zoho (odesílání e-mailů) a poskytovatele serveru. Dále poskytneme údaje, jen pokud to ukládá zákon.',
  ),
  paragraph([
    textNode(
      'Máš právo na přístup ke svým údajům, jejich opravu, výmaz, omezení zpracování, přenositelnost, vznesení námitky a odvolání souhlasu. Napiš nám a vyřídíme to do měsíce zdarma. Stížnost můžeš podat u Úřadu pro ochranu osobních údajů, ',
    ),
    linkNode('uoou.gov.cz', 'https://www.uoou.gov.cz/'),
    textNode('.'),
  ]),

  heading('Cookies a reklama'),
  p(
    'Nezbytná cookie drží tvoje přihlášení; bez ní by přihlášení nefungovalo a souhlas pro ni zákon nevyžaduje. Provoz webu financujeme reklamou Google AdSense, která ukládá vlastní cookies a vyhodnocuje chování na webu. Návštěvnost měříme přes Google Analytics, které si rovněž ukládá cookies. Reklamní ani analytické cookies se nenastaví dřív, než k nim dáš souhlas v liště při první návštěvě; souhlas můžeš kdykoli odvolat a bez něj se reklama zobrazuje neprofilovaná a návštěvnost se počítá jen anonymně, bez rozpoznání zařízení.',
  ),
  paragraph([
    textNode(
      'U reklamy i měření návštěvnosti se Google Ireland Limited stává samostatným správcem takto získaných údajů a může je zpracovávat i mimo EU; podrobnosti jsou v jeho ',
    ),
    linkNode('zásadách ochrany soukromí', 'https://policies.google.com/technologies/partner-sites'),
    textNode('.'),
  ]),

  heading('Spory'),
  paragraph([
    textNode(
      'Vztahy z těchto podmínek se řídí právem České republiky. Spor zkusme nejdřív vyřešit dohodou; jsi-li spotřebitel, můžeš se bezplatně obrátit na Českou obchodní inspekci, ',
    ),
    linkNode('adr.coi.cz', 'https://adr.coi.cz/'),
    textNode('.'),
  ]),

  p('Účinné od 6. 8. 2026, nahrazují verzi z 1. 1. 2015.'),
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
