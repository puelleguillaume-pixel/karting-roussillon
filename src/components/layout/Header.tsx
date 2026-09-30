import { ChevronDown, Gift, Menu, UserRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { MAIN_NAV, type NavItem } from '@/app/navigation';
import { Logo } from '@/components/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/layout';
import { brandContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { useSiteBundle } from '@/lib/queries';
import { MobileMenu } from './MobileMenu';

const LINK =
  'relative flex h-10 items-center whitespace-nowrap px-2.5 font-display text-[0.95rem] font-semibold uppercase tracking-[0.08em] text-asphalt-200 transition-colors hover:text-chalk xl:px-3';
const ACTIVE = 'text-chalk after:absolute after:inset-x-2.5 after:-bottom-[13px] after:h-0.5 after:bg-race-400 xl:after:inset-x-3';

function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const containerRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = item.children?.some((child) => pathname.startsWith(child.to)) || pathname.startsWith(item.to);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <li
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={cx(LINK, 'gap-1', active && ACTIVE)}
        aria-expanded={open}
        aria-controls="menu-formules"
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <ChevronDown aria-hidden className={cx('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      <div id="menu-formules" hidden={!open} className="absolute left-0 top-full pt-3">
        <ul className="min-w-60 border border-asphalt-700 bg-asphalt-900 py-2 shadow-2xl shadow-black/60">
          {item.children?.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'flex px-4 py-2.5 text-[0.95rem] text-asphalt-200 transition-colors hover:bg-asphalt-800 hover:text-chalk',
                    isActive && 'text-race-400',
                  )
                }
              >
                {child.label}
              </NavLink>
            </li>
          ))}
          <li className="mt-1 border-t border-asphalt-700 pt-1">
            <Link to={item.to} onClick={() => setOpen(false)} className="flex px-4 py-2.5 text-sm font-semibold text-race-400 hover:text-chalk">
              Toutes les formules
            </Link>
          </li>
        </ul>
      </div>
    </li>
  );
}

export function Header() {
  const bundle = useSiteBundle().data;
  const brand = bundle ? brandContent(bundle) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    burgerRef.current?.focus();
  }, []);

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-asphalt-800 bg-asphalt-950/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
        {/* Nom accessible = texte visible du logo + « accueil » (WCAG 2.5.3) */}
        <Link to="/" className="shrink-0">
          <Logo logoPath={brand?.data.logo_path} alt={brand?.data.logo_alt} />
          <span className="sr-only"> – accueil</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center">
            {MAIN_NAV.map((item) =>
              item.children ? (
                <NavDropdown key={item.to} item={item} />
              ) : (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => cx(LINK, isActive && ACTIVE)}>
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Sur mobile, ces deux CTA sont dans la barre fixe du bas */}
          <div className="hidden items-center gap-2 md:flex">
            <Link
              to="/mon-compte"
              className="flex size-10 items-center justify-center text-asphalt-200 transition-colors hover:text-chalk"
            >
              <UserRound aria-hidden className="size-5" />
              <span className="sr-only">Mon compte</span>
            </Link>
            <ButtonLink to="/bon-cadeau" variant="secondary" size="sm">
              <Gift aria-hidden className="size-4" />
              <span className="lg:max-xl:sr-only">Bon cadeau</span>
            </ButtonLink>
            <ButtonLink to="/reserver" size="sm">
              Réserver
            </ButtonLink>
          </div>
          <button
            ref={burgerRef}
            type="button"
            className="-mr-2 flex size-11 items-center justify-center text-chalk lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden className="size-6" />
            <span className="sr-only">Ouvrir le menu</span>
          </button>
        </div>
      </Container>
      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  );
}
