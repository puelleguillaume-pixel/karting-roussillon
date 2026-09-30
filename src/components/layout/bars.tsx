import { Database, Gift, Info, Phone, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/layout';
import { bannerContent, contactContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { getDataSource } from '@/lib/data/source';
import { env } from '@/lib/env';
import { useSiteBundle } from '@/lib/queries';
import { useIsClient } from '@/lib/use-is-client';

/** CTA toujours visibles sur mobile (réserver, offrir, appeler). */
export function MobileCtaBar() {
  const bundle = useSiteBundle().data;
  const { pathname } = useLocation();
  const contact = bundle ? contactContent(bundle) : undefined;
  // Pendant la réservation, le parcours porte ses propres boutons
  if (pathname.startsWith('/reserver') || pathname.startsWith('/reservation/')) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-asphalt-700 bg-asphalt-950/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2">
        <ButtonLink to="/reserver" size="md" className="flex-1">
          Réserver
        </ButtonLink>
        <ButtonLink to="/bon-cadeau" variant="secondary" size="md" className="flex-1">
          <Gift aria-hidden className="size-4" />
          Bon cadeau
        </ButtonLink>
        {contact && (
          <a
            href={`tel:${contact.data.phone_e164}`}
            className="flex size-12 shrink-0 items-center justify-center bg-asphalt-800 text-chalk"
          >
            <Phone aria-hidden className="size-5" />
            <span className="sr-only">Appeler le {contact.data.phone}</span>
          </a>
        )}
      </div>
    </div>
  );
}

function bannerKey(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `kr-banner-${hash}`;
}

function readDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Bannière d'information éditée dans l'admin (ex. fermeture météo). */
export function InfoBanner() {
  const bundle = useSiteBundle().data;
  const banner = bundle ? bannerContent(bundle) : undefined;
  const text = banner?.body.trim() ?? '';
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const isClient = useIsClient();
  if (!text) return null;
  const key = bannerKey(text);
  // Masquage mémorisé dans le navigateur : lu après l'hydratation
  if (dismissedKey === key || (isClient && readDismissed(key))) return null;

  const level = banner?.data.level ?? 'info';
  const alert = level !== 'info';
  const dismiss = () => {
    try {
      window.sessionStorage.setItem(key, '1');
    } catch {
      // sans stockage, la bannière reste masquée jusqu'au rechargement
    }
    setDismissedKey(key);
  };

  return (
    <div role="status" className={cx(alert ? 'bg-flag-yellow text-asphalt-950' : 'bg-asphalt-800 text-chalk')}>
      <Container className="flex items-start gap-3 py-2.5 text-sm">
        {alert ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-flag-blue" />}
        <p className="flex-1">
          {banner?.title && <strong className="mr-1.5 font-semibold">{banner.title}</strong>}
          {text}
        </p>
        <button type="button" onClick={dismiss} className="-m-1 flex size-7 shrink-0 items-center justify-center">
          <X aria-hidden className="size-4" />
          <span className="sr-only">Masquer l'information</span>
        </button>
      </Container>
    </div>
  );
}

/** Bandeau du mode démonstration (base PGlite locale). */
export function DemoNotice() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  if (env.dataSource !== 'demo') return null;

  const reset = async () => {
    setResetting(true);
    const source = await getDataSource();
    await source.demo?.reset();
  };

  return (
    <div className="border-b border-flag-blue/30 bg-flag-blue/10 text-asphalt-200">
      <Container className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-xs">
        <p className="flex items-center gap-2">
          <Database aria-hidden className="size-3.5 text-flag-blue" />
          <span>
            <strong className="font-semibold text-chalk">Mode démonstration</strong> : la base de données tourne dans votre navigateur, avec
            des données d'exemple.
          </span>
        </p>
        <Link to="/demo/emails" className="font-semibold text-chalk underline underline-offset-2">
          Emails envoyés
        </Link>
        {confirming ? (
          <span className="flex items-center gap-3">
            <span>Effacer toutes les données de démo ?</span>
            <button type="button" className="font-semibold text-race-400 underline underline-offset-2" onClick={reset} disabled={resetting}>
              {resetting ? 'Réinitialisation…' : 'Confirmer'}
            </button>
            <button type="button" className="underline underline-offset-2" onClick={() => setConfirming(false)} disabled={resetting}>
              Annuler
            </button>
          </span>
        ) : (
          <button type="button" className="font-semibold text-chalk underline underline-offset-2" onClick={() => setConfirming(true)}>
            Réinitialiser la démo
          </button>
        )}
      </Container>
    </div>
  );
}
