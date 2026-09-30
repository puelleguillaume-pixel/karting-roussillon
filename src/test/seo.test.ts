import { describe, expect, it } from 'vitest';
import type { SiteBundle } from '@/lib/data/types';
import { breadcrumbTrail, findRoute, PUBLIC_ROUTES } from '@/lib/seo/routes';
import { breadcrumbJsonLd, businessJsonLd, eventsJsonLd, productsJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';

const SITE = 'https://www.exemple.fr';

const bundle = {
  settings: {},
  content: {
    contact: {
      title: 'Karting Roussillon',
      body: '',
      data: {
        address: 'Mas de la Garrigue Nord',
        postal_code: '66600',
        city: 'Rivesaltes',
        phone: '04 68 62 90 50',
        phone_e164: '+33468629050',
        opening: '',
        geo: { lat: 42.77, lng: 2.88 },
        socials: { facebook: 'https://facebook.com/x', instagram: '' },
      },
    },
  },
  tracks: [],
  vehicle_types: [],
  products: [
    { id: '1', slug: 'session-a', name: 'Session A', price_cents: 2400, is_online_bookable: true, short_description: 'Dès 14 ans', description: '', age_label: '', image_path: null },
    { id: '2', slug: 'alpine', name: 'Alpine', price_cents: null, is_online_bookable: false, short_description: '', description: '', age_label: '', image_path: null },
  ],
  opening_hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    track_id: null,
    weekday,
    opens_at: '09:00:00',
    closes_at: '19:00:00',
    is_closed: false,
    valid_from: null,
    valid_to: null,
    priority: 0,
    label: '',
  })),
  reviews: [],
} as unknown as SiteBundle;

describe('routes publiques', () => {
  it('chemins uniques, tous rattachés à un contenu', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(PUBLIC_ROUTES.every((r) => r.contentKey.startsWith('page.') || r.contentKey.startsWith('legal.'))).toBe(true);
  });
  it('fil d’Ariane avec parent', () => {
    expect(findRoute('/formules/anniversaire/')?.label).toBe('Anniversaire');
    expect(breadcrumbTrail('/formules/anniversaire').map((t) => t.path)).toEqual(['/', '/formules', '/formules/anniversaire']);
    expect(breadcrumbTrail('/')).toEqual([]);
    expect(breadcrumbJsonLd(breadcrumbTrail('/cgv'), SITE)?.itemListElement).toHaveLength(2);
  });
});

describe('données structurées', () => {
  it('établissement local : adresse, coordonnées, horaires regroupés, réseaux renseignés', () => {
    const b = businessJsonLd(bundle, SITE)!;
    expect(b['@type']).toEqual(['LocalBusiness', 'SportsActivityLocation']);
    expect(b.telephone).toBe('+33468629050');
    expect(b.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 42.77, longitude: 2.88 });
    const hours = b.openingHoursSpecification as Array<{ dayOfWeek: string[]; opens: string }>;
    expect(hours).toHaveLength(1);
    expect(hours[0]!.dayOfWeek).toHaveLength(7);
    expect(hours[0]!.opens).toBe('09:00');
    expect(b.sameAs).toEqual(['https://facebook.com/x']);
  });
  it('offres : uniquement les produits tarifés, prix en euros', () => {
    const list = productsJsonLd(bundle, SITE)!;
    const items = list.itemListElement as Array<{ item: { name: string; offers: { price: string; url: string } } }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.item.offers.price).toBe('24.00');
    expect(items[0]!.item.offers.url).toBe(`${SITE}/reserver?produit=session-a`);
  });
  it('événements publiés avec disponibilité', () => {
    const events = eventsJsonLd(
      [
        { item_type: 'event', title: 'Trackday', starts_at: '2026-10-08T07:00:00Z', ends_at: '2026-10-08T16:00:00Z', day: '2026-10-08', status: '', track_slugs: [], event_slug: 'td', places_left: 0 },
        { item_type: 'block', title: 'Privé', starts_at: null, ends_at: null, day: '2026-10-09', status: '', track_slugs: [], event_slug: null, places_left: null },
      ],
      bundle,
      SITE,
    );
    expect(events).toHaveLength(1);
    expect((events[0]!.offers as { availability: string }).availability).toBe('https://schema.org/SoldOut');
  });
  it('sérialisation sans fermeture de balise possible', () => {
    expect(serializeJsonLd({ x: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });
});
