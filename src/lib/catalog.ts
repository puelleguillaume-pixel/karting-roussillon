import type {
  BannerData,
  BrandData,
  ContactData,
  ContentBlock,
  PageContentData,
  Product,
  RequestType,
  SiteBundle,
  Track,
  TrackAccessStatus,
  VehicleType,
} from '@/lib/data/types';

export interface Catalog {
  tracks: Track[];
  circuits: Track[];
  trackById: Map<string, Track>;
  vehicles: VehicleType[];
  vehicleById: Map<string, VehicleType>;
  sessions: Product[];
  packs: Product[];
  sessionByVehicleId: Map<string, Product>;
  byRequestType: Map<RequestType, Product[]>;
  productBySlug: Map<string, Product>;
}

export function buildCatalog(bundle: SiteBundle): Catalog {
  const trackById = new Map(bundle.tracks.map((t) => [t.id, t]));
  const vehicleById = new Map(bundle.vehicle_types.map((v) => [v.id, v]));
  const sessions = bundle.products.filter((p) => p.kind === 'session');
  const packs = bundle.products.filter((p) => p.kind === 'pack');
  const sessionByVehicleId = new Map<string, Product>();
  for (const session of sessions) {
    if (session.vehicle_type_id && !sessionByVehicleId.has(session.vehicle_type_id)) {
      sessionByVehicleId.set(session.vehicle_type_id, session);
    }
  }
  const byRequestType = new Map<RequestType, Product[]>();
  for (const product of bundle.products) {
    if (!product.request_type) continue;
    byRequestType.set(product.request_type, [...(byRequestType.get(product.request_type) ?? []), product]);
  }
  return {
    tracks: bundle.tracks,
    circuits: bundle.tracks.filter((t) => t.display_on_circuits),
    trackById,
    vehicles: bundle.vehicle_types,
    vehicleById,
    sessions,
    packs,
    sessionByVehicleId,
    byRequestType,
    productBySlug: new Map(bundle.products.map((p) => [p.slug, p])),
  };
}

/** Âge minimum effectif d'un produit (surcharge produit, sinon véhicule) */
export function minAgeOf(product: Product, catalog: Catalog): number {
  const vehicle = product.vehicle_type_id ? catalog.vehicleById.get(product.vehicle_type_id) : undefined;
  return product.min_age ?? vehicle?.min_age ?? 0;
}

export function minHeightOf(product: Product, catalog: Catalog): number | null {
  const vehicle = product.vehicle_type_id ? catalog.vehicleById.get(product.vehicle_type_id) : undefined;
  return product.min_height_cm ?? vehicle?.min_height_cm ?? null;
}

/** Pistes où l'on peut rouler avec ce produit */
export function tracksOf(product: Product, catalog: Catalog): Track[] {
  return product.track_ids
    .map((id) => catalog.trackById.get(id))
    .filter((t): t is Track => !!t)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Véhicules proposés sur une piste (via les sessions) */
export function vehiclesOnTrack(trackId: string, catalog: Catalog): VehicleType[] {
  const ids = new Set(catalog.sessions.filter((s) => s.track_ids.includes(trackId)).map((s) => s.vehicle_type_id));
  return catalog.vehicles.filter((v) => ids.has(v.id));
}

/** Économie d'un pack par rapport aux sessions à l'unité (null si non comparable) */
export function packSavingCents(pack: Product, catalog: Catalog): number | null {
  if (!pack.pack || pack.price_cents === null || !pack.vehicle_type_id) return null;
  const single = catalog.sessionByVehicleId.get(pack.vehicle_type_id);
  if (!single?.price_cents) return null;
  const saving = single.price_cents * pack.pack.sessions_count - pack.price_cents;
  return saving > 0 ? saving : null;
}

/** Prix d'appel d'un véhicule (session à l'unité) */
export function startingPrice(vehicle: VehicleType, catalog: Catalog): number | null {
  return catalog.sessionByVehicleId.get(vehicle.id)?.price_cents ?? null;
}

export function isInSeason(product: Product, month = new Date().getMonth() + 1): boolean {
  return !product.active_months || product.active_months.includes(month);
}

// -----------------------------------------------------------------------------
// Contenus éditoriaux
// -----------------------------------------------------------------------------
export function pageContent(bundle: SiteBundle, key: string): ContentBlock<PageContentData> {
  const block = bundle.content[`page.${key}`];
  return (block as ContentBlock<PageContentData> | undefined) ?? { title: '', body: '', data: {} };
}

export function contactContent(bundle: SiteBundle): ContentBlock<ContactData> | undefined {
  return bundle.content.contact as ContentBlock<ContactData> | undefined;
}

export function brandContent(bundle: SiteBundle): ContentBlock<BrandData> | undefined {
  return bundle.content.brand as ContentBlock<BrandData> | undefined;
}

export function bannerContent(bundle: SiteBundle): ContentBlock<BannerData> | undefined {
  return bundle.content.banner as ContentBlock<BannerData> | undefined;
}

// -----------------------------------------------------------------------------
// Libellés métier
// -----------------------------------------------------------------------------
export const TRACK_USAGE_LABELS: Record<Track['usage'], string> = {
  leisure: 'Loisir',
  track_access: 'Droits de piste',
  events: 'Trackdays & événements',
  baby: 'Baby Kart',
};

export const ACCESS_STATUS: Record<TrackAccessStatus, { label: string; flag: string }> = {
  open: { label: 'Ouvert', flag: 'Drapeau vert' },
  restricted: { label: 'Accès restreint', flag: 'Drapeau jaune' },
  closed: { label: 'Fermé au droit de piste', flag: 'Drapeau rouge' },
  trackday: { label: 'Trackday', flag: 'Drapeau bleu' },
  private: { label: 'Privatisé', flag: 'Damier' },
};

export const BLOCK_REASON_LABELS: Record<string, string> = {
  private_event: 'Événement privé',
  team_building: 'Team building',
  trackday: 'Trackday',
  competition: 'Compétition',
  maintenance: 'Entretien',
  weather: 'Météo',
  other: 'Fermeture',
};

export const EVENT_KIND_LABELS: Record<string, string> = {
  trackday: 'Trackday',
  competition: 'Compétition',
  event: 'Événement',
};
