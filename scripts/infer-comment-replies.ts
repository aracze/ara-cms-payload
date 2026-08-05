/**
 * Napojení odpovědí u migrovaných komentářů (vlákna).
 *
 * Starý web vlákna neměl — odpovědi byly samostatné komentáře. Vazby byly
 * ručně určeny kontextovou analýzou textů (ne jen podle oslovení jménem) a jsou
 * uvedeny v `LINKS` níže. Skript je před zápisem VALIDUJE proti databázi:
 *   - oba komentáře existují, jsou typu `comment` a míří na STEJNÝ článek,
 *   - rodič je chronologicky před odpovědí.
 *
 * Ve výchozím stavu jen VYPÍŠE (dry-run). Zápis provede `--apply`.
 *   pnpm infer:replies            # dry-run
 *   pnpm infer:replies -- --apply # zápis
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

const APPLY = process.argv.includes('--apply')

// child = odpověď, parent = komentář, na který reaguje. `note` = důvod (kontext).
const LINKS: Array<{ child: number; parent: number; note: string }> = [
  // Kde se jezdí vlevo (#11)
  { child: 32, parent: 31, note: 'jankonas „Ahoj Honzo…" → dotaz Honzy na auto s volantem vlevo' },
  { child: 369, parent: 368, note: 'jankonas „Dobrý den Marie…" → dotaz MarieZ na Jordánsko' },
  // 2 týdny v Peru (#65)
  { child: 64, parent: 62, note: 'katie_mia hájí článek proti Karlově kritice „14 dní"' },
  { child: 65, parent: 62, note: 'jankonas „Děkuji Karle za váš názor…"' },
  // Seznam věcí na dovolenou (#55)
  { child: 54, parent: 38, note: 'Bára „navázala dotazem na pana Pavla: Proč nechat doma…"' },
  { child: 296, parent: 294, note: 'ženská „přesně jak píše Lucka, mě taky pomohl"' },
  // Akční nabídky letenek (#59)
  { child: 298, parent: 297, note: 'jankonas „Dobrý den Evito…" řeší její problém' },
  { child: 342, parent: 298, note: 'viki „mám stejný problém jako Evita" (pokračuje ve vlákně)' },
  // Iguazú (#57)
  { child: 307, parent: 306, note: 'jankonas „Dobrý den Petro…"' },
  // České školství (#88)
  {
    child: 340,
    parent: 329,
    note: 'jankonas „Máte pravdu… zmiňujete v komentáři" (kontext, bez oslovení)',
  },
  // Méně jisté:
  {
    child: 366,
    parent: 305,
    note: 'Honza „Stačí si přečíst článek." → dotaz mileny na nákup letenek',
  },
  { child: 312, parent: 311, note: 'jankonas obecná odpověď na dotazy o práci v Anglii' },
]

const relId = (v: unknown): number | null =>
  typeof v === 'number'
    ? v
    : v && typeof v === 'object' && 'id' in v
      ? Number((v as { id: number }).id)
      : null

type CommentDoc = {
  id: number
  authorName: string
  type: string
  createdAt?: string | null
  relatedTo?: { relationTo?: string; value?: unknown } | null
  parentComment?: unknown
}

async function run() {
  console.log(`\n🧵 Napojení odpovědí${APPLY ? ' (ZÁPIS)' : ' (DRY-RUN)'}\n`)
  const payload = await getPayload({ config: configPromise })

  const load = async (id: number): Promise<CommentDoc | null> => {
    try {
      return (await payload.findByID({
        collection: 'comments',
        id,
        depth: 0,
        overrideAccess: true,
      })) as unknown as CommentDoc
    } catch {
      return null
    }
  }

  const ts = (c: CommentDoc) => new Date(c.createdAt ?? 0).getTime()

  const valid: Array<{ child: number; parent: number; note: string }> = []

  for (const link of LINKS) {
    const [child, parent] = await Promise.all([load(link.child), load(link.parent)])
    const problems: string[] = []
    if (!child) problems.push('odpověď neexistuje')
    if (!parent) problems.push('rodič neexistuje')
    if (child && parent) {
      const aChild = relId(child.relatedTo?.value)
      const aParent = relId(parent.relatedTo?.value)
      if (child.type !== 'comment' || parent.type !== 'comment') problems.push('není typu comment')
      if (aChild == null || aChild !== aParent) problems.push('různé články')
      if (ts(parent) > ts(child)) problems.push('rodič je NOVĚJŠÍ než odpověď')
      if (relId(child.parentComment) != null) problems.push('odpověď už má vazbu (přepíšu)')
    }

    const label =
      child && parent
        ? `#${link.child} „${child.authorName}" → #${link.parent} „${parent.authorName}"`
        : `#${link.child} → #${link.parent}`
    if (problems.filter((p) => p !== 'odpověď už má vazbu (přepíšu)').length > 0) {
      console.log(`❌ ${label}\n     ${link.note}\n     PROBLÉM: ${problems.join(', ')}`)
    } else {
      console.log(
        `✅ ${label}\n     ${link.note}${problems.length ? `\n     (${problems.join(', ')})` : ''}`,
      )
      valid.push(link)
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`Vazeb v mapě:   ${LINKS.length}`)
  console.log(`Validních:      ${valid.length}`)
  console.log('══════════════════════════════════════════')

  if (!APPLY) {
    console.log('\nℹ️  DRY-RUN — nic se nezapsalo. Zápis: pnpm infer:replies -- --apply\n')
    process.exit(valid.length === LINKS.length ? 0 : 1)
  }

  let applied = 0
  let failed = 0
  for (const link of valid) {
    try {
      await payload.update({
        collection: 'comments',
        id: link.child,
        data: { parentComment: link.parent },
        overrideAccess: true,
        context: { skipHooks: true },
      })
      applied++
    } catch (err) {
      failed++
      console.error(`❌ zápis #${link.child}:`, err)
    }
  }
  console.log(
    `\n✅ Zapsáno vazeb: ${applied}/${valid.length}${failed ? ` (selhalo: ${failed})` : ''}\n`,
  )
  // Nenulový exit při jakémkoliv selhání zápisu — ať automatizace nehlásí úspěch
  // po částečné migraci (i když nebyly validní všechny vazby z mapy).
  process.exit(failed > 0 || valid.length !== LINKS.length ? 1 : 0)
}

run().catch((err) => {
  console.error('💥 Chyba:', err)
  process.exit(1)
})
