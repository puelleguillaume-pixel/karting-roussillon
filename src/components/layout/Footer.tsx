import { Clock, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { FORMULA_NAV, LEGAL_NAV, MAIN_NAV } from '@/app/navigation';
import { SOCIAL_ICONS } from '@/components/social';
import { Logo } from '@/components/Logo';
import { Container, Kerb } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/feedback';
import { brandContent, contactContent } from '@/lib/catalog';
import { useConsent } from '@/lib/consent-context';
import { useSiteBundle } from '@/lib/queries';

const COLUMN_TITLE = 'font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400';
const FOOTER_LINK = 'text-asphalt-200 transition-colors hover:text-race-400';

export function Footer() {
  const bundle = useSiteBundle().data;
  const contact = bundle ? contactContent(bundle) : undefined;
  const brand = bundle ? brandContent(bundle) : undefined;
  const { openPreferences } = useConsent();
  const socials = Object.entries(contact?.data.socials ?? {}).filter(([, url]) => !!url) as Array<[keyof typeof SOCIAL_ICONS, string]>;

  return (
    <footer className="border-t border-asphalt-800 bg-asphalt-900 pb-24 md:pb-0">
      <Kerb />
      <Container className="grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-5">
          <Logo logoPath={brand?.data.logo_path} alt={brand?.data.logo_alt} />
          {contact ? (
            <address className="flex flex-col gap-3 not-italic text-asphalt-200">
              <p className="flex gap-3">
                <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-race-400" />
                <span>
                  {contact.data.address}
                  <br />
                  {contact.data.postal_code} {contact.data.city}
                  {contact.data.area ? ` (secteur ${contact.data.area})` : ''}
                </span>
              </p>
              <p className="flex gap-3">
                <Phone aria-hidden className="mt-1 size-4 shrink-0 text-race-400" />
                <a href={`tel:${contact.data.phone_e164}`} className={FOOTER_LINK}>
                  {contact.data.phone}
                </a>
              </p>
              <p className="flex gap-3">
                <Clock aria-hidden className="mt-1 size-4 shrink-0 text-race-400" />
                <span>{contact.data.opening}</span>
              </p>
            </address>
          ) : (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-44" />
            </div>
          )}
          {socials.length > 0 && (
            <ul className="flex gap-2" aria-label="Réseaux sociaux">
              {socials.map(([network, url]) => {
                const { label, Icon } = SOCIAL_ICONS[network];
                return (
                  <li key={network}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex size-11 items-center justify-center bg-asphalt-800 text-chalk transition-colors hover:bg-race-600"
                    >
                      <Icon className="size-5" />
                      <span className="sr-only">{label} (nouvel onglet)</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <nav aria-label="Activités" className="flex flex-col gap-4">
          <p className={COLUMN_TITLE}>Activités</p>
          <ul className="flex flex-col gap-2.5">
            {MAIN_NAV.filter((item) => !item.children && item.to !== '/contact' && item.to !== '/chronos').map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={FOOTER_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/bon-cadeau" className={FOOTER_LINK}>
                Bon cadeau
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Formules" className="flex flex-col gap-4">
          <p className={COLUMN_TITLE}>Formules</p>
          <ul className="flex flex-col gap-2.5">
            {FORMULA_NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={FOOTER_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Informations" className="flex flex-col gap-4">
          <p className={COLUMN_TITLE}>Informations</p>
          <ul className="flex flex-col gap-2.5">
            <li>
              <Link to="/chronos" className={FOOTER_LINK}>
                Chronos
              </Link>
            </li>
            <li>
              <Link to="/contact" className={FOOTER_LINK}>
                Contact & accès
              </Link>
            </li>
            <li>
              <Link to="/mon-compte" className={FOOTER_LINK}>
                Mon compte
              </Link>
            </li>
            {LEGAL_NAV.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={FOOTER_LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={openPreferences} className={FOOTER_LINK}>
                Gérer les cookies
              </button>
            </li>
          </ul>
        </nav>
      </Container>
      <div className="border-t border-asphalt-800">
        <Container className="flex flex-col gap-2 py-6 text-sm text-asphalt-400 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Karting Roussillon</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Tous les prix sont indiqués TTC.</span>
            <Link to="/admin" className="underline underline-offset-2 hover:text-chalk">
              Espace équipe
            </Link>
          </p>
        </Container>
      </div>
    </footer>
  );
}
