'use client'

import { useEffect, useId, useRef, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronDown, LogOut, User as UserIcon, X, Settings } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { LoginForm } from './login-form'
import { RegisterForm } from './register-form'
import { ForgotPasswordForm } from './password-forms'
import { OPEN_LOGIN_EVENT } from './login-hint-link'
import { logoutAction } from '@/lib/auth-actions'
import type { CurrentUser } from '@/lib/auth'

/**
 * Účet v hlavičce webu, hned vpravo od „Rady na cestu".
 *
 * Nepřihlášený vidí kruh s papouškem, přihlášený svůj avatar (tentýž jako na
 * profilu a u textů) se šipkou.
 *
 * Papoušek je ODKAZ na /prihlaseni, ne tlačítko — bez JavaScriptu tedy funguje
 * jako obyčejný odkaz. Když JavaScript běží, klik se zachytí a otevře se modál
 * se stejným formulářem, takže uživatel neopustí stránku (progresivní
 * vylepšení). Ctrl/⌘+klik i prostřední tlačítko ponecháváme prohlížeči, ať jde
 * odkaz otevřít v nové kartě.
 */
export function HeaderAccount({
  user,
  turnstileSiteKey,
}: {
  user: CurrentUser | null
  /** Veřejný klíč Turnstile pro registraci / obnovu hesla přímo v okně. */
  turnstileSiteKey?: string | null
}) {
  const pathname = usePathname()
  const search = useSearchParams()
  // Kam se po přihlášení vrátit: aktuální adresa včetně dotazu.
  const query = search.toString()
  // Stránky přihlašovacího toku nejsou smysluplný cíl návratu — z nich se
  // předává dál jejich vlastní `next` (odkud uživatel původně přišel), jinak by
  // se adresa zanořovala do sebe (/prihlaseni?next=/prihlaseni?next=…).
  // Hodnotu `next` ověřuje až server (safeNext), tady se jen přeposílá.
  const AUTH_PATHS = ['/prihlaseni', '/registrace', '/zapomenute-heslo', '/nove-heslo']
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const nextPath = isAuthPage ? search.get('next') || '/' : `${pathname}${query ? `?${query}` : ''}`

  return user ? (
    <AccountMenu user={user} />
  ) : (
    <LoginTrigger nextPath={nextPath || '/'} turnstileSiteKey={turnstileSiteKey ?? null} />
  )
}

/** Zavření po kliknutí mimo + klávesou Esc; vrácení fokusu na spouštěč. */
/**
 * Chování modálního okna, které se od „vyskakovacího panelu" čeká:
 *  - fokus zůstává UVNITŘ okna (Tab z posledního prvku skočí na první),
 *  - stránka pod oknem se nedá rolovat,
 *  - po zavření se fokus vrátí na ikonu, ze které se okno otevřelo.
 *
 * Bez prvních dvou bodů se dá z okna „vypadnout" klávesnicí do stránky za ním
 * a číst obsah, který je vizuálně zakrytý překryvem.
 */
function useModalBehavior(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  view: unknown,
) {
  useEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return

    const puvodniOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const zaostritelne = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.getClientRects().length > 0)
    // `getClientRects`, ne `offsetParent`: u prvků s `position: fixed` vrací
    // offsetParent null i když jsou vidět, takže by z pasti vypadly.

    // Fokus dovnitř jen tehdy, když si ho formulář nevzal sám (`autoFocus`).
    if (!panel.contains(document.activeElement)) zaostritelne()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = zaostritelne()
      if (list.length === 0) return
      const prvni = list[0]
      const posledni = list[list.length - 1]
      // Fokus se zatoulal mimo okno → vrátit ho na první prvek.
      if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        prvni.focus()
        return
      }
      if (e.shiftKey && document.activeElement === prvni) {
        e.preventDefault()
        posledni.focus()
      } else if (!e.shiftKey && document.activeElement === posledni) {
        e.preventDefault()
        prvni.focus()
      }
    }

    // Posluchač na DOKUMENTU, ne na panelu: kdyby fokus skončil mimo okno
    // (třeba na <body> po zavření nabídky), panel by Tab už neviděl a past by
    // přestala fungovat.
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = puvodniOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
    // `view` je v závislostech schválně: přepnutím na registraci/obnovu hesla
    // se vymění obsah okna, takže seznam zaostřitelných prvků je jiný.
  }, [open, view, panelRef])
}

function useDismiss(
  open: boolean,
  close: () => void,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  const panelRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Zavřít i při PŘECHODU NA JINOU STRÁNKU. Hlavička (a s ní tenhle stav) žije
  // v layoutu, takže po kliknutí na odkaz uvnitř okna (např. „Zapomenuté heslo?"
  // nebo „Založit nový účet") React komponentu neodmountuje a okno by zůstalo
  // viset nad nově otevřenou stránkou.
  useEffect(() => {
    close()
    // Reagujeme JEN na změnu adresy; `close` je stabilní callback z rodiče.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        triggerRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close, triggerRef])

  return panelRef
}

/** Který krok okno zrovna ukazuje. */
type View = 'login' | 'register' | 'forgot'

function LoginTrigger({
  nextPath,
  turnstileSiteKey,
}: {
  nextPath: string
  turnstileSiteKey: string | null
}) {
  const [open, setOpen] = useState(false)
  // Registrace i obnova hesla se otevřou PŘÍMO V OKNĚ, ať uživatel neskáče
  // mezi stránkami. Stránky /registrace a /zapomenute-heslo zůstávají jako
  // plnohodnotná záložní cesta (bez JavaScriptu, z odkazu v e-mailu…).
  const [view, setView] = useState<View>('login')
  // `useCallback`: `close` chodí do efektů s posluchači; bez stabilní reference
  // by se odebíraly a přidávaly při každém překreslení.
  const close = useCallback(() => {
    setOpen(false)
    setView('login')
  }, [])
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const panelRef = useDismiss(open, close, triggerRef)
  useModalBehavior(open, panelRef, view)
  const titleId = useId()

  // Okno umí otevřít i odkaz „přihlas se" u formuláře komentáře/recenze —
  // pošle vlastní událost, aby uživatel nepřišel o rozepsaný text.
  useEffect(() => {
    const onOpen = () => {
      setView('login')
      setOpen(true)
    }
    window.addEventListener(OPEN_LOGIN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, onOpen)
  }, [])

  const HEADINGS: Record<View, { title: string; subtitle: string }> = {
    login: { title: 'Vítej na Ara.cz', subtitle: 'Přihlas se a měj vše na jednom místě.' },
    register: { title: 'Nový účet', subtitle: 'Měj svůj obsah pod svým jménem.' },
    forgot: { title: 'Zapomenuté heslo', subtitle: 'Nevadí, nové si nastavíš za chvilku.' },
  }

  return (
    <>
      <Link
        ref={triggerRef}
        href={`/prihlaseni?next=${encodeURIComponent(nextPath)}`}
        // Přihlašovací stránka je noindex a `next` dělá z každé stránky webu
        // unikátní adresu — nofollow šetří vyhledávačům zbytečné procházení.
        rel="nofollow"
        onClick={(e) => {
          // Nechat prohlížeči otevření v nové kartě/okně.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          setOpen(true)
        }}
        aria-label="Přihlásit se"
        aria-haspopup="dialog"
        aria-expanded={open}
        // Jen bílý obrys, BEZ výplně — stejná logika jako „Rady na cestu" vedle.
        // Hlavička je většinou průhledná (plné modré pozadí dostane jen při
        // rozbaleném menu), takže průsvitná výplň nad fotkou prosvětlovala flek
        // a na modré byla naopak neviditelná. Obrys funguje v obou stavech.
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-white/50 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        {/* 24 px (a ne 21 jako avatar) ZÁMĚRNĚ: avatar má plnou barvu a bílý
            rámeček, takže působí jako pevný objekt, zatímco tady papoušek leží
            v prázdném kruhu a při stejné velikosti vypadal drobnější. */}
        <Image src="/assets/avatar-parrot.png" alt="" width={24} height={24} unoptimized />
      </Link>

      {open && (
        <>
          {/* Ztmavení pozadí — modál stojí nad obsahem stránky. */}
          <div className="fixed inset-0 z-[300] bg-[#0a1626]/55 animate-in fade-in duration-150 motion-reduce:animate-none" />
          <div className="fixed inset-0 z-[310] grid place-items-center overflow-y-auto p-4">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              // Užší okno (400 px): při 460 px byla políčka skoro 400 px široká,
              // což u dvou krátkých údajů působilo rozvláčně.
              className="relative w-full max-w-[400px] rounded-2xl bg-white p-7 shadow-[0_18px_44px_rgba(15,30,50,0.22)] animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <button
                type="button"
                onClick={() => {
                  close()
                  triggerRef.current?.focus()
                }}
                aria-label="Zavřít"
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-[#8a939b] transition-colors hover:bg-[#f0f4f9] hover:text-[#2c3643]"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Návrat o krok zpět (jen mimo přihlášení). */}
              {view !== 'login' && (
                <button
                  type="button"
                  onClick={() => setView('login')}
                  className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-[#8a939b] transition-colors hover:text-[#215491]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Zpět
                </button>
              )}

              {/* Papoušek naváže na ikonu, na kterou uživatel právě klikl, a věta
                  odpoví na „proč se mám přihlašovat". */}
              <div className="mb-6 flex flex-col items-center">
                {/* Kolečko 48 px, papoušek 32 px = poměr 0,667 (stejný jako
                    v hlavičce). Menší kolečko s poměrem 0,64 působilo drobně. */}
                <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#2f7d9a] to-[#215491]">
                  <Image
                    src="/assets/avatar-parrot.png"
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                </span>
                <h2 id={titleId} className="font-heading text-[20px] font-bold text-[#1a3f6c]">
                  {HEADINGS[view].title}
                </h2>
                <p className="mt-1.5 text-center text-[14.5px] leading-relaxed text-[#8a939b]">
                  {HEADINGS[view].subtitle}
                </p>
              </div>

              {view === 'login' && (
                <LoginForm
                  nextPath={nextPath}
                  autoFocus
                  onForgot={() => setView('forgot')}
                  onRegister={() => setView('register')}
                />
              )}
              {view === 'register' && <RegisterForm turnstileSiteKey={turnstileSiteKey} />}
              {view === 'forgot' && <ForgotPasswordForm turnstileSiteKey={turnstileSiteKey} />}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function AccountMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useDismiss(open, () => setOpen(false), triggerRef)

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Účet ${user.displayName}`}
        className="flex items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <UserAvatar
          name={user.displayName}
          avatarUrl={user.avatarUrl}
          size={36}
          className="border-2"
        />
        <ChevronDown
          className={`h-4 w-4 text-white/80 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-[calc(100%+10px)] z-[300] w-[248px] overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_rgba(15,30,50,0.20)] ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          <div className="flex items-center gap-3 border-b border-[#eef1f4] px-4 py-3.5">
            <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size={40} />
            <span className="min-w-0">
              <span className="block truncate font-heading text-[15px] font-bold text-[#1a3f6c]">
                {user.displayName}
              </span>
              {user.username && (
                <span className="block truncate text-[13px] text-[#8a939b]">@{user.username}</span>
              )}
            </span>
          </div>

          {/* Profil má jen uživatel s uživatelským jménem — bez ní by odkaz vedl na 404. */}
          {user.profileHref && (
            <Link
              href={user.profileHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-[14.5px] text-[#2c3643] transition-colors hover:bg-[#f5f8fb]"
            >
              <UserIcon className="h-4 w-4 text-[#215491]" aria-hidden="true" />
              Můj profil
            </Link>
          )}

          <Link
            href="/nastaveni"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-[14.5px] text-[#2c3643] transition-colors hover:bg-[#f5f8fb]"
          >
            <Settings className="h-4 w-4 text-[#215491]" aria-hidden="true" />
            Nastavení účtu
          </Link>

          {/* Odhlášení je FORMULÁŘ (POST), ne odkaz — odhlášení je změna stavu
              a nemá se dát vyvolat prostým navštívením adresy. */}
          <form action={logoutAction} className="border-t border-[#eef1f4]">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14.5px] text-[#2c3643] transition-colors hover:bg-[#f5f8fb]"
            >
              <LogOut className="h-4 w-4 text-[#215491]" aria-hidden="true" />
              Odhlásit se
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
