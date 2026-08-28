import React from 'react'
import Link from 'next/link'
import { PageCategory } from '@/types/payload'
import {
  SunIcon,
  RoadIcon,
  PassportsIcon,
  MoneyIcon,
  HeartIcon,
  MasksIcon,
  FoodIcon,
  BedIcon,
} from './legacy-icons'

/**
 * Panel „Praktické informace do …“ (parita s legacy `_practicalInfo.gsp`):
 * řada ikon s odkazy na podstránky praktických informací (Počasí, Doprava,
 * Vstupní podmínky…). Zobrazuje se na místech k navštívení pod články jako
 * poslední sekce stránky. Dlaždice bez existující podstránky se vynechá,
 * bez jediné dlaždice se nevykreslí ani celá sekce.
 *
 * Odkazy dodává page.tsx z UŽ NAČTENÝCH dat (vlastní děti stránky, jinak děti
 * nejbližšího předka s praktickými informacemi — stejný zdroj jako karta
 * v pravém panelu), takže sekce nepřidává žádný dotaz do CMS.
 */

export interface PracticalInfoPanelDef {
  category: PageCategory
  label: string
  icon: React.ReactNode
}

/**
 * Pořadí a popisky dlaždic jako na starém webu (Vstup = Vstupní podmínky…).
 * Výšky ikon jsou opticky vyvážené (schválená „řada B" × 0,72 pro kruh):
 * plné tvary (silnice, srdce, miska, postel, pasy) menší, linkové (slunce,
 * peníze) větší — jinak vedle sebe nepůsobí stejně mohutně. Pasy jsou jediná
 * ikona s ručním docentrováním (nakloněná dvojice sedí o fous mimo těžiště;
 * posunutá miska se uživateli nelíbila, ostatní sedí).
 */
export const practicalInfoPanelDefs: PracticalInfoPanelDef[] = [
  { category: PageCategory.Pocasi, label: 'počasí', icon: <SunIcon height={46} /> },
  { category: PageCategory.Doprava, label: 'doprava', icon: <RoadIcon height={33} /> },
  {
    category: PageCategory.Vstupni_podminky,
    label: 'vstup',
    icon: (
      <span className="-translate-x-px translate-y-px">
        <PassportsIcon height={42} />
      </span>
    ),
  },
  { category: PageCategory.Mena_a_ceny, label: 'měna', icon: <MoneyIcon height={45} /> },
  { category: PageCategory.Zdravi_a_bezpeci, label: 'zdraví', icon: <HeartIcon height={33} /> },
  { category: PageCategory.Jazyk_a_kultura, label: 'kultura', icon: <MasksIcon height={37} /> },
  { category: PageCategory.Jidlo_a_pit, label: 'jídlo', icon: <FoodIcon height={33} /> },
  { category: PageCategory.Ubytovani, label: 'ubytování', icon: <BedIcon height={32} /> },
]

export interface PracticalInfoLinkItem {
  def: PracticalInfoPanelDef
  href: string
}

interface PracticalInfoLinksProps {
  /** Skloněný název místa vč. předložky („do Chorvatska“) — vlastník sekce. */
  genitive: string
  items: PracticalInfoLinkItem[]
}

export function PracticalInfoLinks({ genitive, items }: PracticalInfoLinksProps) {
  if (items.length === 0) return null

  return (
    <section className="w-full bg-white py-16">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        {/* Nadpis ve stejném vzoru jako sousední sekce („Příprava do…", články). */}
        <div className="mb-12 flex flex-col items-center text-center">
          <h2 className="font-heading mb-3 text-3xl font-bold tracking-tight text-[#1a3f6c]">
            Praktické informace {genitive}
          </h2>
          <div className="h-[1px] w-[30px] rounded-full bg-[#d45145]"></div>
        </div>

        {/* Ikony na kruhovém podkladu (volba uživatele 28. 8. 2026) — kruhy
            přebírají barvy karet sekce Příprava do… (podklad #f3f6fa, rámeček
            #e0e8f1), ať se sekce od zbytku webu neliší. Hover = nadzvednutí
            se stínem jako u karet. Mezery: od xl drží všech 8 dlaždic jednu
            řadu (8×96 + 7×56 = 1160 < 1184 vnitřní šířky max-w-7xl); pod xl
            platí menší mezera (40 px), takže běžných 7 dlaždic drží řadu už
            od lg a s 8 dlaždicemi se řada zalomí. */}
        <ul className="flex flex-wrap items-start justify-center gap-x-6 gap-y-10 sm:gap-x-10 xl:gap-x-14">
          {items.map(({ def, href }) => (
            <li key={def.category}>
              <Link href={href} className="group flex w-24 flex-col items-center gap-4">
                <span className="flex size-[88px] items-center justify-center rounded-full border border-[#e0e8f1] bg-[#f3f6fa] text-[#1a3f6c] transition-all duration-300 [--sun-mask:#f3f6fa] group-hover:-translate-y-0.5 group-hover:text-[#2a5a9c] group-hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)]">
                  {def.icon}
                </span>
                <span className="text-[16px] leading-none font-semibold text-[#333d49] transition-colors group-hover:text-[#2a5a9c]">
                  {def.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
