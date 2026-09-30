import { Clock, MapPin, Navigation, Phone, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { directionsLinks } from '@/app/navigation';
import { ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { Container, Eyebrow, Kerb } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { cx } from '@/lib/cx';
import type { ContactData, ContentBlock, OpeningHours, Review, SectionText } from '@/lib/data/types';
import { formatDay } from '@/lib/format';
import { summarizeOpening } from '@/lib/opening';

// -----------------------------------------------------------------------------
// En-tête des pages intérieures
// -----------------------------------------------------------------------------
interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  intro?: string;
  actions?: ReactNode;
  aside?: ReactNode;
}

export function PageHeader({ eyebrow, title, intro, actions, aside }: PageHeaderProps) {
  return (
    <header className="relative isolate overflow-hidden border-b border-asphalt-800 bg-asphalt-950">
      <div aria-hidden className="speed-lines absolute inset-0 -z-10 opacity-70" />
      <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-5">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="text-display-xl font-extrabold uppercase">{title}</h1>
          {intro && <p className="max-w-[60ch] text-lg text-asphalt-200 sm:text-xl">{intro}</p>}
          {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
        </div>
        {aside && <div className="hidden lg:block">{aside}</div>}
      </Container>
      <Kerb className="absolute inset-x-0 bottom-0" />
    </header>
  );
}

// -----------------------------------------------------------------------------
// Accès & horaires (aucune carte tierce intégrée : liens d'itinéraire)
// -----------------------------------------------------------------------------
export function AccessPanel({ contact, openingHours }: { contact: ContentBlock<ContactData>; openingHours: OpeningHours[] }) {
  const lines = summarizeOpening(openingHours);
  const query = contact.data.maps_query ?? `${contact.data.address}, ${contact.data.postal_code} ${contact.data.city}`;
  const links = directionsLinks(query);
  return (
    <div className="grid gap-px bg-asphalt-800 sm:grid-cols-3">
      <div className="flex flex-col gap-3 bg-asphalt-900 p-6">
        <MapPin aria-hidden className="size-6 text-race-400" />
        <p className="font-display text-display-sm font-bold uppercase">Adresse</p>
        <address className="not-italic text-asphalt-200">
          {contact.data.address}
          <br />
          {contact.data.postal_code} {contact.data.city}
          {contact.data.area && <span className="block text-asphalt-400">Secteur {contact.data.area}</span>}
        </address>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <ButtonAnchor href={links.google} target="_blank" rel="noreferrer" variant="secondary" size="sm">
            <Navigation aria-hidden className="size-4" />
            Google Maps
          </ButtonAnchor>
          <ButtonAnchor href={links.waze} target="_blank" rel="noreferrer" variant="secondary" size="sm">
            Waze
          </ButtonAnchor>
        </div>
      </div>
      <div className="flex flex-col gap-3 bg-asphalt-900 p-6">
        <Clock aria-hidden className="size-6 text-race-400" />
        <p className="font-display text-display-sm font-bold uppercase">Horaires</p>
        {lines.length > 0 ? (
          <dl className="flex flex-col gap-1 text-asphalt-200">
            {lines.map((line) => (
              <div key={line.days} className="flex flex-wrap justify-between gap-x-4">
                <dt>{line.days}</dt>
                <dd className="tabular font-semibold text-chalk">{line.hours}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-asphalt-200">{contact.data.opening}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 bg-asphalt-900 p-6">
        <Phone aria-hidden className="size-6 text-race-400" />
        <p className="font-display text-display-sm font-bold uppercase">Téléphone</p>
        <p className="font-display text-3xl font-bold tabular">
          <a href={`tel:${contact.data.phone_e164}`} className="hover:text-race-400">
            {contact.data.phone}
          </a>
        </p>
        <p className="text-sm text-asphalt-400">Réservations, groupes et informations.</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Avis clients
// -----------------------------------------------------------------------------
const SOURCE_LABELS: Record<Review['source'], string> = {
  google: 'Avis Google',
  facebook: 'Avis Facebook',
  site: 'Avis client',
  other: 'Avis client',
};

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${rating} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cx('size-4', i < rating ? 'fill-flag-yellow text-flag-yellow' : 'text-asphalt-600')} />
      ))}
    </span>
  );
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {reviews.map((review, i) => (
        <li key={review.id}>
          <Reveal delay={i * 0.06} className="h-full">
            <figure className="flex h-full flex-col gap-4 bg-asphalt-900 p-6 ring-1 ring-asphalt-800">
              <Stars rating={review.rating} />
              <blockquote className="flex-1 text-asphalt-200">{review.body}</blockquote>
              <figcaption className="flex flex-col text-sm">
                <span className="font-semibold text-chalk">{review.author_name}</span>
                <span className="text-asphalt-400">
                  {SOURCE_LABELS[review.source]}
                  {review.review_date && ` · ${formatDay(review.review_date, { month: 'long', year: 'numeric' })}`}
                </span>
              </figcaption>
            </figure>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Bandeau d'appel à l'action final (damier)
// -----------------------------------------------------------------------------
export function CtaBand({ text }: { text: SectionText | undefined }) {
  if (!text?.title) return null;
  return (
    <section className="relative isolate overflow-hidden bg-race-600">
      <div aria-hidden className="checker absolute inset-y-0 right-0 -z-10 w-1/2 text-black/15 [--checker:28px] [mask-image:linear-gradient(to_left,black,transparent)]" />
      <Container className="flex flex-col gap-6 py-14 sm:py-16 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-display-lg font-extrabold uppercase text-white">{text.title}</h2>
          {text.body && <p className="text-lg text-white/90">{text.body}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/reserver" variant="light" size="lg">
            Réserver
          </ButtonLink>
          <ButtonLink to="/bon-cadeau" variant="dark" size="lg">
            Bon cadeau
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
