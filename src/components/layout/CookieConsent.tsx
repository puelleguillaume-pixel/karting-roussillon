import { AnimatePresence, m } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useConsent } from '@/lib/consent-context';
import type { ConsentCategory } from '@/lib/consent-storage';
import { useIsClient } from '@/lib/use-is-client';

const CATEGORIES: Array<{ id: ConsentCategory; title: string; description: string }> = [
  {
    id: 'analytics',
    title: "Mesure d'audience",
    description: 'Statistiques de fréquentation anonymisées pour améliorer le site.',
  },
  {
    id: 'ads',
    title: 'Publicité et conversions',
    description: 'Mesure des réservations issues de nos annonces Google Ads.',
  },
];

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-race-600' : 'bg-asphalt-600'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white transition-[left] ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function PreferencesDialog() {
  const { consent, closePreferences, save, acceptAll, rejectAll } = useConsent();
  const [choices, setChoices] = useState<Record<ConsentCategory, boolean>>(
    () => consent?.choices ?? { analytics: false, ads: false },
  );
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreferences();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closePreferences]);

  return (
    <m.div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePreferences();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[90svh] w-full max-w-lg flex-col gap-5 overflow-y-auto border border-asphalt-700 bg-asphalt-900 p-6 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-display-md font-bold uppercase">
            Réglages des cookies
          </h2>
          <button type="button" onClick={closePreferences} className="-m-2 flex size-10 items-center justify-center text-asphalt-300 hover:text-chalk">
            <X aria-hidden className="size-5" />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
        <ul className="flex flex-col divide-y divide-asphalt-700">
          <li className="flex items-start justify-between gap-4 py-4">
            <div>
              <p className="font-semibold">Strictement nécessaires</p>
              <p className="text-sm text-asphalt-300">Fonctionnement du site et mémorisation de vos choix. Toujours actifs.</p>
            </div>
            <span className="text-sm font-semibold text-asphalt-400">Requis</span>
          </li>
          {CATEGORIES.map((category) => (
            <li key={category.id} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="font-semibold">{category.title}</p>
                <p className="text-sm text-asphalt-300">{category.description}</p>
              </div>
              <Toggle
                id={`consent-${category.id}`}
                label={category.title}
                checked={choices[category.id]}
                onChange={(value) => setChoices((current) => ({ ...current, [category.id]: value }))}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" size="sm" onClick={rejectAll} className="sm:flex-1">
            Tout refuser
          </Button>
          <Button variant="secondary" size="sm" onClick={acceptAll} className="sm:flex-1">
            Tout accepter
          </Button>
          <Button size="sm" onClick={() => save(choices)} className="sm:flex-1">
            Enregistrer
          </Button>
        </div>
      </div>
    </m.div>
  );
}

export function CookieConsent() {
  const { hasDecided, preferencesOpen, acceptAll, rejectAll, openPreferences } = useConsent();
  // Le choix est stocké dans le navigateur : rien dans le HTML pré-rendu
  const isClient = useIsClient();
  if (!isClient) return null;

  return (
    <>
      <AnimatePresence>
        {!hasDecided && !preferencesOpen && (
          <m.section
            aria-label="Cookies"
            className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-50 border border-asphalt-700 bg-asphalt-900/98 p-5 shadow-2xl shadow-black/70 md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div className="flex flex-col gap-4">
              <p className="flex items-center gap-2 font-display text-lg font-bold uppercase">
                <Cookie aria-hidden className="size-5 text-race-400" />
                Vos données, votre choix
              </p>
              <p className="text-sm text-asphalt-200">
                Avec votre accord, nous mesurons l'audience du site et l'efficacité de nos annonces. Vous pouvez changer d'avis à tout
                moment via « Gérer les cookies ».{' '}
                <Link to="/cookies" className="text-race-400 underline underline-offset-4">
                  En savoir plus
                </Link>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={rejectAll} className="flex-1">
                  Tout refuser
                </Button>
                <Button variant="secondary" size="sm" onClick={acceptAll} className="flex-1">
                  Tout accepter
                </Button>
              </div>
              <button type="button" onClick={openPreferences} className="self-start text-sm font-semibold text-asphalt-200 underline underline-offset-4 hover:text-chalk">
                Personnaliser
              </button>
            </div>
          </m.section>
        )}
      </AnimatePresence>
      <AnimatePresence>{preferencesOpen && <PreferencesDialog />}</AnimatePresence>
    </>
  );
}
