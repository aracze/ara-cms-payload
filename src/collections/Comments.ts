import type { CollectionConfig, Where } from 'payload'
import { isAdmin } from '../access/isAdmin'
import { populateCommentLabel } from '../hooks/populateCommentLabel'
import { populateCommentAuthorPublic } from '../hooks/populateCommentAuthorPublic'
import { revalidateCommentAfterChange, revalidateCommentAfterDelete } from '../hooks/revalidation'

// Zápis (vkládání/úpravy/mazání) zatím jen pro adminy — stejný vzor jako u Users.
// Veřejné odesílání z frontendu (jméno + captcha) se doplní později spolu s frontendem.

// Komentáře (na článcích) a recenze (na místech / turistických cílech = Pages).
// Jediný strukturální rozdíl: recenze má hvězdičkové hodnocení (rating), komentář ne.
// Odpovídá legacy modelu (comment + comment_details), kde review = záznam s ratingem.
export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['relatedTo', 'authorName', 'type', 'rating', 'status', 'commentedAt'],
  },
  access: {
    // Anonym: skrýt spam + recenze na NEpublikované stránky. Články jsou vždy veřejné
    // (nemají drafty). Řeší se přes polymorfní `relatedTo` (relationTo + value), protože
    // nelze filtrovat cizí `_status` inline.
    //
    // POZOR na obrácený zápis („povol vše KROMĚ draftů"): negativní operátory na
    // polymorfní `relatedTo.value` (`not_in`, `not_equals`) nefungují — ověřeno
    // měřením: zahodí VŠECHNY recenze na stránkách (z 371 komentářů vrátí jen 95
    // článkových). Povolovat se proto musí pozitivním `in`.
    //
    // Toto pravidlo běží při KAŽDÉM anonymním čtení komentářů, takže musí být levné:
    // dřív si bezpodmínečně vytáhlo seznam všech publikovaných stránek (na tomto
    // webu 3067 ID, ~136 ms) jen kvůli 4 draftům, na kterých většinou žádný
    // komentář není. Nově se to řeší dvěma malými dotazy a plný seznam se staví
    // jen tehdy, když na draftu opravdu něco visí.
    read: async ({ req }): Promise<boolean | Where> => {
      if (req.user) return true
      const notSpam: Where = { status: { not_equals: 'spam' } }

      // 1) Bez draft stránek není co skrývat (běžný stav).
      const drafts = await req.payload.find({
        collection: 'pages',
        where: { _status: { equals: 'draft' } },
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        req,
        select: {},
      })
      const draftIds = drafts.docs.map((p) => p.id)
      if (draftIds.length === 0) return notSpam

      // 2) Existuje vůbec komentář/recenze na některém z draftů? Stačí první nález.
      const onDraft = await req.payload.find({
        collection: 'comments',
        where: {
          and: [
            // Spam veřejně stejně nesvítí, takže kvůli němu nemá cenu spouštět
            // drahou větev níž ani přidávat stránku mezi povolené.
            notSpam,
            { 'relatedTo.relationTo': { equals: 'pages' } },
            { 'relatedTo.value': { in: draftIds } },
          ],
        },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
        select: {},
      })
      if (onDraft.docs.length === 0) return notSpam

      // 3) Je co skrývat → povolíme jen stránky, které KOMENTÁŘE MAJÍ a nejsou draft.
      //    Seznam je tak dlouhý jako počet komentovaných stránek (tady 230), ne jako
      //    počet všech stránek webu (3067).
      const commented = await req.payload.find({
        collection: 'comments',
        where: { and: [notSpam, { 'relatedTo.relationTo': { equals: 'pages' } }] },
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        req,
        select: { relatedTo: true },
      })
      const allowedIds = [
        ...new Set(
          commented.docs
            .map((c) => (c as { relatedTo?: { value?: unknown } }).relatedTo?.value)
            .filter((v): v is number | string => typeof v === 'number' || typeof v === 'string'),
        ),
      ].filter((id) => !draftIds.includes(id as never))

      return {
        and: [
          notSpam,
          {
            or: [
              { 'relatedTo.relationTo': { equals: 'articles' } },
              {
                and: [
                  { 'relatedTo.relationTo': { equals: 'pages' } },
                  { 'relatedTo.value': { in: allowedIds } },
                ],
              },
            ],
          },
        ],
      }
    },
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  // Změna komentáře (vč. veřejného vložení přes Local API i označení spam v adminu)
  // okamžitě invaliduje cache výpisu komentářů daného článku/stránky.
  hooks: {
    afterChange: [revalidateCommentAfterChange],
    afterDelete: [revalidateCommentAfterDelete],
  },
  fields: [
    {
      // Titulek (useAsTitle) = název navázaného obsahu (stránka/článek). Ukládá se, aby šel
      // vykreslit i fulltextově hledat (polymorfní relaci Payload jako titulek/hledání neumí).
      // Počítá se při ukládání dohledáním titulku cíle. Stejné názvy nevadí – v seznamu/search
      // se komentáře rozliší dalšími sloupci (autor, typ, datum…).
      name: 'label',
      type: 'text',
      index: true,
      admin: { readOnly: true, hidden: true },
      hooks: {
        beforeChange: [populateCommentLabel],
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'comment',
      options: [
        { label: 'Komentář', value: 'comment' },
        { label: 'Recenze', value: 'review' },
      ],
      admin: {
        description: 'Recenze (na místech) má navíc hvězdičkové hodnocení.',
      },
    },
    {
      name: 'rating',
      label: 'Hodnocení (hvězdičky)',
      type: 'number',
      min: 1,
      max: 5,
      admin: {
        // Zobrazit jen u recenze.
        condition: (data) => data?.type === 'review',
      },
      validate: (
        value: number | null | undefined,
        { siblingData }: { siblingData: Partial<{ type: string }> },
      ) => {
        if (siblingData?.type === 'review') {
          if (value == null) return 'Recenze musí mít hodnocení 1–5.'
          if (value < 1 || value > 5) return 'Hodnocení musí být 1–5.'
        }
        if (siblingData?.type === 'comment' && value != null) {
          return 'Komentář nemá mít hodnocení.'
        }
        return true
      },
    },
    {
      name: 'body',
      label: 'Text',
      type: 'textarea',
      required: true,
    },
    {
      // Cíl komentáře/recenze: článek (komentáře) nebo stránka/místo (recenze).
      name: 'relatedTo',
      label: 'Vztaženo k',
      type: 'relationship',
      relationTo: ['articles', 'pages'],
      required: true,
      index: true,
    },
    {
      name: 'authorName',
      label: 'Jméno autora',
      type: 'text',
      required: true,
      admin: {
        description: 'Vyplňuje každý (registrace se nevyžaduje).',
      },
    },
    {
      // Napojení na registrovaného uživatele, pokud existuje. U anonymních prázdné.
      name: 'author',
      label: 'Registrovaný autor',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      // Vlákna: na který komentář tento reaguje (odpověď). Prázdné = kořenový
      // komentář. Legacy web vazbu neměl (odpovědi byly samostatné komentáře) —
      // dopočítá ji skript infer-comment-replies; nové odpovědi z webu ji nesou
      // rovnou. Sebe-referenční relace v rámci stejné kolekce.
      name: 'parentComment',
      label: 'Odpověď na',
      type: 'relationship',
      relationTo: 'comments',
      // Bez hlubokého populace řetězu vláken (sebe-referenční relace).
      maxDepth: 1,
      // Zákaz „odpověď sám na sebe" (přímý cyklus). Delší cykly (A→B→A) neřešíme
      // zde — vykreslení je proti nim odolné (rootOf má strop a self-detekci).
      validate: (value: unknown, { id }: { id?: string | number }): true | string => {
        if (value == null || id == null) return true
        const parentId = typeof value === 'object' ? (value as { id?: number }).id : value
        return parentId === id ? 'Komentář nemůže být odpovědí sám na sebe.' : true
      },
      admin: {
        position: 'sidebar',
        description: 'Nechte prázdné u běžného komentáře; vyplněné = odpověď na jiný komentář.',
      },
    },
    {
      // Bezpečná podmnožina registrovaného autora (username + avatar) pro veřejný
      // web — anonymní čtení nesmí populovat celý User (Users.read = isAdminOrSelf).
      // Vzor stejný jako `createdByPublic` u článků/stránek.
      name: 'authorPublic',
      type: 'json',
      virtual: true,
      hooks: {
        afterRead: [populateCommentAuthorPublic],
      },
      admin: {
        hidden: true,
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      // Anonymní read filtruje `status != spam` na každém requestu → index.
      index: true,
      defaultValue: 'published',
      options: [
        { label: 'Publikováno', value: 'published' },
        { label: 'Spam', value: 'spam' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Vše se publikuje; spam se označí (skryje z veřejnosti).',
      },
    },
    {
      name: 'commentedAt',
      label: 'Datum vložení',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Původní datum z legacy webu (u migrovaných dat).',
      },
    },
    {
      name: 'legacyCommentId',
      label: 'Legacy Comment ID',
      type: 'number',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
