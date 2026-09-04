/**
 * Třídy kontejneru hlavičky, sdílené se všemi panely, které ji překrývají
 * nebo z ní vyjíždějí (mega menu kontinentů, vyhledávací lišta a její výsledky).
 *
 * Oproti běžnému kontejneru stránek (`max-w-7xl mx-auto px-4 md:px-12`) má
 * v pásmu lg–xl (1024–1279 px) užší odsazení 24 px: logo, pět kontinentů, lupa,
 * „Rady na cestu" a účet potřebují ~1000 px a s odsazením 48 px po stranách
 * na iPadu Pro na výšku (přesně 1024 px) přetékaly za okraj okna. Od xl se
 * vrací původní 48 px. Cokoli, co má lícovat s hlavičkou, musí použít tuto
 * konstantu, jinak se v tabletovém pásmu posune o 24 px.
 */
export const HEADER_CONTAINER_CLASS = 'max-w-7xl mx-auto px-4 md:px-12 lg:px-6 xl:px-12'
