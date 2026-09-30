import { AnimatePresence, m } from 'framer-motion';
import { Gift, Phone, UserRound, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router';
import { MAIN_NAV } from '@/app/navigation';
import { ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { contactContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { useSiteBundle } from '@/lib/queries';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bundle = useSiteBundle().data;
  const contact = bundle ? contactContent(bundle) : undefined;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Pré-rendu au build : pas de <body> côté serveur (menu fermé de toute façon)
  if (typeof document === 'undefined') return null;
  // Portail vers <body> : le flou (backdrop-filter) de l'en-tête créerait sinon
  // un bloc conteneur qui enfermerait ce panneau « fixed » dans la hauteur du header.
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          ref={panelRef}
          id="menu-mobile"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-asphalt-950 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] lg:hidden"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="flex h-16 items-center justify-between border-b border-asphalt-800 px-4">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400">Menu</span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-11 items-center justify-center text-chalk"
            >
              <X aria-hidden className="size-6" />
              <span className="sr-only">Fermer le menu</span>
            </button>
          </div>

          <nav aria-label="Navigation principale" className="flex-1 px-4 py-6">
            <ul className="flex flex-col">
              {MAIN_NAV.map((item) => (
                <li key={item.to} className="border-b border-asphalt-800">
                  <NavLink
                    to={item.to}
                    end={!!item.children}
                    onClick={onClose}
                    className={({ isActive }) =>
                      cx('flex py-3.5 font-display text-3xl font-bold uppercase tracking-tight', isActive ? 'text-race-400' : 'text-chalk')
                    }
                  >
                    {item.label}
                  </NavLink>
                  {item.children && (
                    <ul className="flex flex-col pb-3">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <NavLink
                            to={child.to}
                            onClick={onClose}
                            className={({ isActive }) =>
                              cx('flex py-2 pl-4 text-lg', isActive ? 'text-race-400' : 'text-asphalt-300')
                            }
                          >
                            {child.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-3 border-t border-asphalt-800 px-4 py-6">
            <ButtonLink to="/reserver" size="lg" block onClick={onClose}>
              Réserver une session
            </ButtonLink>
            <ButtonLink to="/bon-cadeau" variant="secondary" size="lg" block onClick={onClose}>
              <Gift aria-hidden className="size-5" />
              Offrir un bon cadeau
            </ButtonLink>
            <ButtonLink to="/mon-compte" variant="ghost" className="self-start" onClick={onClose}>
              <UserRound aria-hidden className="size-5" />
              Mon compte
            </ButtonLink>
            {contact && (
              <ButtonAnchor href={`tel:${contact.data.phone_e164}`} variant="ghost" className="self-start">
                <Phone aria-hidden className="size-5" />
                {contact.data.phone}
              </ButtonAnchor>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
