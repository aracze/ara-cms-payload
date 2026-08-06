/**
 * Výchozí úvodní fotka stránek, které vlastní obrázek nemají — dnes veřejné
 * profily (/profil/<username>) a statické stránky (O nás, Reklama, Podmínky).
 *
 * Záměrně „tichá" fotka: mlhavá krajina bez poznatelného místa. Rušný snímek
 * (města, zvířata, památky) by soupeřil o pozornost s titulkem a u profilu
 * navíc s avatarem — ověřeno srovnáním variant. Zároveň o žádné stránce
 * netvrdí „tady jsme byli".
 *
 * Fotku lze vyměnit přepsáním této jedné adresy (Cloudinary URL bez parametrů
 * za `?`). Zmenšení a formát řeší `next/image` přes cloudinary-loader.
 * POZOR: s fotkou je nutné vyměnit i `DEFAULT_COVER_BLUR` níže.
 */
export const DEFAULT_COVER_URL =
  'https://res.cloudinary.com/ara/image/upload/v1785491112/mn4obrhlr3khap1ocrej.jpg'

/**
 * Rozmazaný náhled TÉŽE fotky (20 × 13 px, ~340 B) vložený přímo do HTML.
 * Překryje pozadí sekce od první vteřiny, takže při načítání není vidět holá
 * barva — dřív tu problikávala nejprve pestrá barva podle jména, pak tmavá
 * z ostatních hlaviček; obojí bylo proti bílému obsahu pod vlnkou nápadné.
 *
 * Vygenerování po výměně fotky (z projektu, sharp je v závislostech):
 *   node -e "const s=require('sharp');(async()=>{const b=await s(await (await fetch(URL)).arrayBuffer().then(Buffer.from)).resize(20,13,{fit:'cover'}).blur(1.2).jpeg({quality:45}).toBuffer();console.log('data:image/jpeg;base64,'+b.toString('base64'))})()"
 */
export const DEFAULT_COVER_BLUR =
  'data:image/jpeg;base64,/9j/2wBDABIMDRANCxIQDhAUExIVGywdGxgYGzYnKSAsQDlEQz85Pj1HUGZXR0thTT0+WXlaYWltcnNyRVV9hnxvhWZwcm7/2wBDARMUFBsXGzQdHTRuST5Jbm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm7/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAMCBAUG/8QAHhAAAgICAgMAAAAAAAAAAAAAAQIAAwQRBRIxYZH/xAAVAQEBAAAAAAAAAAAAAAAAAAACA//EABsRAAIBBQAAAAAAAAAAAAAAAAABEQIDEhMx/9oADAMBAAIRAxEAPwDqsi9SpI0RMDOy6SxUqNymvKWMo2o+yFypkDuy6PoyCvR1AdMirDT2O0hFlBvyYSm9AwP/2Q=='

/**
 * Výřez výchozí fotky. Krajina má zajímavý pás v horní třetině, takže se
 * záběr posouvá nad střed — jinak z hera zbyde jen tráva.
 * Formát řeší `parseObjectPosition` ve StaticHeroImage.
 */
export const DEFAULT_COVER_POSITION = 'object-position: 50% 42%'
