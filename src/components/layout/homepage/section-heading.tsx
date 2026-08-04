// Centrovaný nadpis sekce homepage — stejný vzor jako sekce na stránkách míst
// (places-to-visit, articles-list-classic): Poppins, tmavě modrá, korálová
// linka. Výjimkou je „Co je nového" — proudový formát s filtry si nechává
// nadpis vlevo (vědomé rozhodnutí, 4. 8. 2026).

export function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <div className="flex flex-col items-center text-center mb-8">
      <h2 id={id} className="text-3xl font-bold text-[#1a3f6c] mb-3 font-heading tracking-tight">
        {children}
      </h2>
      <div className="w-[30px] h-[1px] bg-[#d45145] rounded-full"></div>
    </div>
  )
}
