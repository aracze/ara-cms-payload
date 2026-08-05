import Link from 'next/link'
import Image from 'next/image'
import { fetchFooter } from '@/lib/payload'
import { FooterContact, ImageLink } from '@/types/payload'
import { richTextToHtml } from '@/lib/rich-text-html'
import { isCloudinary } from '@/lib/cloudinary-loader'

import DOMPurify from 'isomorphic-dompurify'

function FooterLogo({ logo }: { logo: ImageLink }) {
  if (logo.svgCode) {
    const sanitizedSvg = DOMPurify.sanitize(logo.svgCode, {
      USE_PROFILES: { svg: true },
    })

    return (
      <Link
        href={logo.link?.href ?? '/'}
        className="flex items-center shrink-0 text-[#005580] hover:text-[#215491] transition-colors"
        aria-label="Ara.cz – Cestovní průvodce po světě"
      >
        {/* Logo je jednobarevná křivka s natvrdo bílým `fill` — přebarvíme ho
            na firemní modrou, aby fungovalo na světlém podkladu patičky. */}
        <div
          className="h-[22px] w-auto flex items-center [&_svg]:h-[22px] [&_svg]:w-auto [&_path]:fill-current"
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />
      </Link>
    )
  }

  if (logo.image?.url) {
    const rawUrl = String(logo.image.url)
    // Relativní cesty z médií doplníme o base URL Payloadu (stejně jako header).
    const logoUrl = rawUrl.startsWith('/')
      ? new URL(
          rawUrl,
          process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000',
        ).toString()
      : rawUrl
    return (
      <Link href={logo.link?.href ?? '/'} className="flex items-center shrink-0">
        <Image
          src={logoUrl}
          alt={logo.image.alternativeText ?? 'Ara.cz – Cestovní průvodce po světě'}
          height={22}
          width={76}
          className="h-[22px] w-auto object-contain"
          unoptimized={!isCloudinary(logoUrl)}
        />
      </Link>
    )
  }

  return null
}

function FooterContactBlock({ contact }: { contact: FooterContact }) {
  if (!contact.email && !contact.personName) return null

  return (
    <div className="shrink-0 md:ml-auto md:text-right">
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="font-heading text-base font-semibold tracking-tight text-[#005580] no-underline hover:text-[#215491] hover:underline underline-offset-4"
        >
          {contact.email}
        </a>
      ) : null}
      {contact.personName ? (
        <p className="mt-1 text-sm text-[#6e757b]">
          Kontaktní osoba{' '}
          {contact.personHref ? (
            <Link
              href={contact.personHref}
              className="text-[#353535] no-underline border-b border-[#d8dcdf] hover:text-[#005580] hover:border-current transition-colors"
            >
              {contact.personName}
            </Link>
          ) : (
            contact.personName
          )}
        </p>
      ) : null}
    </div>
  )
}

export async function Footer() {
  const footer = await fetchFooter()

  const navItems = footer?.navItems ?? []
  const copyrightHtml = footer?.copyrightText ? richTextToHtml(footer.copyrightText) : ''
  const logo = footer?.logo ?? null
  const lede = footer?.lede?.trim() || null
  const contact = footer?.contact ?? { email: null, personName: null, personHref: null }

  return (
    <footer className="bg-[#f4f5f6] border-t border-[#d8dcdf] w-full z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        {/* Horní řada: logo · výzva · kontakt. Na mobilu se skládá pod sebe. */}
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5 pt-6 pb-5">
          {logo ? (
            <FooterLogo logo={logo} />
          ) : (
            <Link
              href="/"
              aria-label="Ara.cz – Cestovní průvodce po světě"
              className="flex items-center shrink-0"
            >
              <Image
                src="/assets/logo-ara.png"
                alt="Ara.cz – Cestovní průvodce po světě"
                height={22}
                width={76}
                className="h-[22px] w-auto object-contain"
                unoptimized
              />
            </Link>
          )}

          {lede ? (
            // Bez horní meze šířky — v řadě je na větu dost místa a umělý
            // ořez na „hezkou" délku ji zbytečně lámal na dva řádky.
            <p className="flex-1 min-w-[280px] m-0 text-sm leading-relaxed text-[#353535] text-pretty">
              {lede}
            </p>
          ) : null}

          <FooterContactBlock contact={contact} />
        </div>

        {/* Spodní lišta: právní odkazy + copyright. */}
        <div className="flex flex-wrap items-center justify-between gap-x-7 gap-y-2 pt-3.5 pb-4 border-t border-[#d8dcdf]">
          {navItems.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 list-none p-0 m-0">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-[#353535] no-underline hover:text-[#005580] hover:underline underline-offset-4 transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <div
            className="text-xs leading-[18px] text-[#6e757b] [&_a]:text-[#353535] [&_a]:no-underline hover:[&_a]:text-[#005580] [&_p]:m-0"
            dangerouslySetInnerHTML={{ __html: copyrightHtml }}
          />
        </div>
      </div>
    </footer>
  )
}
