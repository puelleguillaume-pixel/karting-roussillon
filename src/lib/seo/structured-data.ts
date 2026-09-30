// Données structurées schema.org (JSON-LD) construites depuis la base.
// Pur calcul, sans dépendance d'exécution : utilisé par le site (rendu React)
// et par le pré-rendu des pages (scripts/prerender.mjs, exécuté par Node).
import type { CalendarItem, ContactData, SiteBundle } from '../data/types.ts';

type JsonLd = Record<string, unknown>;

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function absolute(siteUrl: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl}${path.startsWith('/') ? path : `/images/${path.replace(/^\.?\/?(images\/)?/, '')}`}`;
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

function contactOf(bundle: SiteBundle): { name: string; data: ContactData } | null {
  const block = bundle.content['contact'];
  return block ? { name: block.title || 'Karting Roussillon', data: block.data as unknown as ContactData } : null;
}

/** Horaires généraux (hors règles datées et hors pistes spécifiques), regroupés par plage identique */
function openingHours(bundle: SiteBundle): JsonLd[] {
  const general = bundle.opening_hours.filter((o) => !o.track_id && !o.valid_from && !o.valid_to && !o.is_closed);
  const groups = new Map<string, string[]>();
  for (const o of general) {
    const key = `${o.opens_at.slice(0, 5)}-${o.closes_at.slice(0, 5)}`;
    groups.set(key, [...(groups.get(key) ?? []), DAYS[o.weekday]!]);
  }
  return [...groups.entries()].map(([key, days]) => {
    const [opens, closes] = key.split('-');
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: days.map((d) => `https://schema.org/${d}`), opens, closes };
  });
}

/** Établissement : LocalBusiness + SportsActivityLocation (fiche Google, recherche locale) */
export function businessJsonLd(bundle: SiteBundle, siteUrl: string): JsonLd | null {
  const contact = contactOf(bundle);
  if (!contact) return null;
  const { data } = contact;
  const brand = bundle.content['brand']?.data as { logo_path?: string | null } | undefined;
  const home = bundle.content['page.home']?.data as { hero_image?: string | null; hero_poster?: string | null } | undefined;
  const socials = Object.values(data.socials ?? {}).filter((url): url is string => !!url);
  const prices = bundle.products.map((p) => p.price_cents).filter((c): c is number => c != null && c > 0);
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'SportsActivityLocation'],
    '@id': `${siteUrl}/#etablissement`,
    name: contact.name,
    url: `${siteUrl}/`,
    telephone: data.phone_e164 || data.phone,
    image: absolute(siteUrl, home?.hero_image ?? home?.hero_poster ?? brand?.logo_path ?? null),
    logo: absolute(siteUrl, brand?.logo_path ?? null),
    description: bundle.content['page.home']?.data && (bundle.content['page.home'].data as { seo_description?: string }).seo_description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: data.address,
      postalCode: data.postal_code,
      addressLocality: data.city,
      addressRegion: 'Occitanie',
      addressCountry: 'FR',
    },
    ...(data.geo ? { geo: { '@type': 'GeoCoordinates', latitude: data.geo.lat, longitude: data.geo.lng } } : {}),
    areaServed: ['Rivesaltes', 'Claira', 'Perpignan', 'Pyrénées-Orientales'],
    openingHoursSpecification: openingHours(bundle),
    ...(prices.length ? { priceRange: `${euros(Math.min(...prices)).replace('.00', '')} € – ${euros(Math.max(...prices)).replace('.00', '')} €`, currenciesAccepted: 'EUR' } : {}),
    ...(socials.length ? { sameAs: socials } : {}),
  };
}

/** Site web (nom affiché dans les résultats Google) */
export function websiteJsonLd(bundle: SiteBundle, siteUrl: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#site`,
    name: bundle.content['contact']?.title || 'Karting Roussillon',
    url: `${siteUrl}/`,
    inLanguage: 'fr-FR',
  };
}

/** Catalogue : un Product + Offer par session, pack ou expérience tarifée */
export function productsJsonLd(bundle: SiteBundle, siteUrl: string): JsonLd | null {
  const items = bundle.products.filter((p) => p.price_cents != null && p.price_cents > 0);
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Karts et tarifs',
    itemListElement: items.map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        description: p.short_description || p.description || p.age_label,
        image: absolute(siteUrl, p.image_path),
        brand: { '@type': 'Brand', name: bundle.content['contact']?.title || 'Karting Roussillon' },
        offers: {
          '@type': 'Offer',
          price: euros(p.price_cents!),
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          url: p.is_online_bookable ? `${siteUrl}/reserver?produit=${p.slug}` : `${siteUrl}/karts-tarifs`,
          seller: { '@id': `${siteUrl}/#etablissement` },
        },
      },
    })),
  };
}

/** Trackdays et événements publiés à venir */
export function eventsJsonLd(items: CalendarItem[], bundle: SiteBundle, siteUrl: string): JsonLd[] {
  const contact = contactOf(bundle);
  return items
    .filter((i) => i.item_type === 'event' && i.starts_at && i.ends_at && i.title)
    .map((i) => ({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: i.title,
      startDate: i.starts_at,
      endDate: i.ends_at,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: contact?.name ?? 'Karting Roussillon',
        address: contact
          ? { '@type': 'PostalAddress', streetAddress: contact.data.address, postalCode: contact.data.postal_code, addressLocality: contact.data.city, addressCountry: 'FR' }
          : undefined,
      },
      organizer: { '@id': `${siteUrl}/#etablissement` },
      url: i.event_slug ? `${siteUrl}/reserver/evenement/${i.event_slug}` : `${siteUrl}/trackday`,
      ...(i.event_slug && i.places_left != null
        ? {
            offers: {
              '@type': 'Offer',
              url: `${siteUrl}/reserver/evenement/${i.event_slug}`,
              availability: i.places_left > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
            },
          }
        : {}),
    }));
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>, siteUrl: string): JsonLd | null {
  if (trail.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, index) => ({ '@type': 'ListItem', position: index + 1, name: t.name, item: `${siteUrl}${t.path === '/' ? '/' : t.path}` })),
  };
}

/** Sérialisation sûre dans une balise <script> (pas de fermeture prématurée) */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
