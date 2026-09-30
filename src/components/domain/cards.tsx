import { ArrowRight, Briefcase, Cake, Car, GraduationCap, PartyPopper, Route, Ruler, Timer, User } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { trackShapeFor } from '@/components/trackShapes';
import { KartVisual, MediaImage, TrackIllustration } from '@/components/visuals';
import { minHeightOf, packSavingCents, pageContent, startingPrice, tracksOf, TRACK_USAGE_LABELS, type Catalog } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import type { Product, SiteBundle, Track, VehicleType } from '@/lib/data/types';
import { formatHeight, formatInteger, formatLength, formatPrice } from '@/lib/format';

const CARD = 'bg-asphalt-900 ring-1 ring-asphalt-800';
const CARD_LINK = 'transition-[box-shadow,transform] duration-200 ease-race hover:-translate-y-0.5 hover:ring-race-600 focus-visible:ring-race-400';

// -----------------------------------------------------------------------------
// Karts
// -----------------------------------------------------------------------------
export function VehicleTeaser({ vehicle, catalog }: { vehicle: VehicleType; catalog: Catalog }) {
  const session = catalog.sessionByVehicleId.get(vehicle.id);
  const price = startingPrice(vehicle, catalog);
  return (
    <Link to={`/karts-tarifs#${vehicle.slug}`} className={cx('group flex h-full flex-col', CARD, CARD_LINK)}>
      <KartVisual vehicle={vehicle} />
      <div className="flex flex-1 items-end justify-between gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-xl font-bold uppercase leading-tight">{vehicle.name}</h3>
          <p className="text-sm text-asphalt-400">{session?.age_label || `Dès ${vehicle.min_age} ans`}</p>
        </div>
        {price !== null && (
          <p className="shrink-0 text-right">
            <span className="block text-xs uppercase tracking-wide text-asphalt-400">la session</span>
            <span className="font-display text-2xl font-bold tabular">{formatPrice(price)}</span>
          </p>
        )}
      </div>
    </Link>
  );
}

export function VehicleCard({ vehicle, catalog, dimmed = false }: { vehicle: VehicleType; catalog: Catalog; dimmed?: boolean }) {
  const session = catalog.sessionByVehicleId.get(vehicle.id);
  const tracks = session ? tracksOf(session, catalog) : [];
  const minHeight = session ? minHeightOf(session, catalog) : vehicle.min_height_cm;
  const titleId = `kart-${vehicle.slug}`;
  return (
    <article
      id={vehicle.slug}
      aria-labelledby={titleId}
      className={cx('flex h-full flex-col transition-opacity duration-300', CARD, dimmed && 'opacity-35')}
    >
      <KartVisual vehicle={vehicle} />
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 id={titleId} className="text-display-sm font-bold uppercase">
            {vehicle.name}
          </h3>
          {session?.price_cents != null && (
            <p className="shrink-0 text-right leading-none">
              <span className="font-display text-4xl font-extrabold tabular">{formatPrice(session.price_cents)}</span>
              {session.duration_min && <span className="mt-1 block text-sm text-asphalt-400">{session.duration_min} min</span>}
            </p>
          )}
        </div>
        {vehicle.description && <p className="text-asphalt-300">{vehicle.description}</p>}
        <ul className="flex flex-wrap gap-2" aria-label="Conditions">
          <li>
            <Chip icon={<User />}>{session?.age_label || `Dès ${vehicle.min_age} ans`}</Chip>
          </li>
          {minHeight !== null && (
            <li>
              <Chip icon={<Ruler />}>Taille min. {formatHeight(minHeight)}</Chip>
            </li>
          )}
          {tracks.map((track) => (
            <li key={track.id}>
              <Chip tone="outline" icon={<Route />}>
                {track.length_m ? formatLength(track.length_m) : track.short_name}
              </Chip>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-2">
          {session?.is_online_bookable ? (
            <ButtonLink to={`/reserver?produit=${session.slug}`} size="sm" block>
              Réserver<span className="sr-only"> : {vehicle.name}</span>
            </ButtonLink>
          ) : (
            <p className="border border-dashed border-asphalt-600 px-4 py-2.5 text-center text-sm font-semibold text-asphalt-300">
              Sur place uniquement
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function PackCard({ pack, catalog }: { pack: Product; catalog: Catalog }) {
  const saving = packSavingCents(pack, catalog);
  const vehicle = pack.vehicle_type_id ? catalog.vehicleById.get(pack.vehicle_type_id) : undefined;
  const titleId = `pack-${pack.slug}`;
  return (
    <article aria-labelledby={titleId} className={cx('relative flex h-full flex-col gap-5 overflow-hidden p-6', CARD)}>
      <div aria-hidden className="checker absolute -right-5 -top-5 size-16 rotate-12 text-chalk/[0.06] [--checker:8px]" />
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="text-display-sm font-bold uppercase">
          {pack.name}
        </h3>
        {vehicle && <p className="text-sm text-asphalt-400">{vehicle.name}</p>}
      </div>
      {pack.price_cents !== null && (
        <p className="font-display text-5xl font-extrabold leading-none tabular">{formatPrice(pack.price_cents)}</p>
      )}
      {pack.pack && (
        <div className="flex flex-col gap-2">
          <div aria-hidden className="flex gap-1.5">
            {Array.from({ length: pack.pack.sessions_count }, (_, i) => (
              <span key={i} className="h-2 flex-1 bg-race-600" />
            ))}
          </div>
          <p className="font-display text-lg font-semibold uppercase tracking-wide">
            {pack.pack.sessions_count} × {pack.pack.session_min} min{pack.pack.same_day ? ' · le même jour' : ''}
          </p>
        </div>
      )}
      <ul className="flex flex-wrap gap-2" aria-label="Conditions">
        {saving !== null && (
          <li>
            <Chip tone="green">{formatPrice(saving)} d'économie</Chip>
          </li>
        )}
        {pack.age_label && (
          <li>
            <Chip icon={<User />}>{pack.age_label}</Chip>
          </li>
        )}
        {pack.requires_chrono_validation && (
          <li>
            <Chip tone="yellow" icon={<Timer />}>
              Validation chrono requise
            </Chip>
          </li>
        )}
      </ul>
      <div className="mt-auto">
        {pack.is_online_bookable ? (
          <ButtonLink to={`/reserver?produit=${pack.slug}`} size="sm" block>
            Réserver le pack<span className="sr-only"> {pack.name}</span>
          </ButtonLink>
        ) : (
          <p className="text-sm font-semibold text-asphalt-300">Sur place uniquement</p>
        )}
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// Pistes
// -----------------------------------------------------------------------------
export function TrackCard({ track }: { track: Track }) {
  return (
    <Link to={`/circuits#${track.slug}`} className={cx('group flex h-full flex-col overflow-hidden', CARD, CARD_LINK)}>
      <div className="relative aspect-[16/10] bg-asphalt-850">
        {track.image_path ? (
          <MediaImage path={track.image_path} alt={track.name} />
        ) : (
          <TrackIllustration shape={trackShapeFor(track.slug)} animated={false} className="absolute inset-0 h-full w-full p-5" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        {track.length_m && (
          <p className="font-display text-6xl font-extrabold leading-none tabular">
            {formatInteger(track.length_m)}
            <span className="ml-1 text-2xl text-asphalt-400">m</span>
          </p>
        )}
        <h3 className="text-display-sm font-bold uppercase">{track.short_name}</h3>
        <div className="flex flex-wrap gap-2">
          <Chip tone="outline">{TRACK_USAGE_LABELS[track.usage]}</Chip>
          {track.min_age !== null && <Chip>Dès {track.min_age} ans</Chip>}
          {track.requires_booking && <Chip tone="yellow">Sur réservation</Chip>}
        </div>
        <p className="text-sm text-asphalt-300">{track.description}</p>
        <span className="mt-auto inline-flex items-center gap-2 pt-2 font-display font-bold uppercase tracking-wide text-race-400">
          Découvrir
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Formules & expériences (textes issus des pages en base)
// -----------------------------------------------------------------------------
const FORMULAS = [
  { key: 'anniversaire', to: '/formules/anniversaire', Icon: Cake },
  { key: 'evg-evjf', to: '/formules/evg-evjf', Icon: PartyPopper },
  { key: 'team-building', to: '/formules/team-building', Icon: Briefcase },
  { key: 'ecole-de-pilotage', to: '/ecole-de-pilotage', Icon: GraduationCap },
  { key: 'alpine-a110s', to: '/alpine-a110s', Icon: Car },
] as const;

export function FormulaCards({ bundle, only }: { bundle: SiteBundle; only?: ReadonlyArray<(typeof FORMULAS)[number]['key']> }) {
  const items = FORMULAS.filter((f) => !only || only.includes(f.key));
  return (
    <ul className={cx('grid gap-4 sm:grid-cols-2', items.length > 3 ? 'lg:grid-cols-3 xl:grid-cols-5' : 'lg:grid-cols-3')}>
      {items.map(({ key, to, Icon }) => {
        const content = pageContent(bundle, key);
        if (!content.title) return null;
        return (
          <li key={key}>
            <Link to={to} className={cx('group flex h-full flex-col gap-4 p-6', CARD, CARD_LINK)}>
              <Icon aria-hidden className="size-8 text-race-400" />
              <h3 className="text-display-sm font-bold uppercase">{content.title}</h3>
              <p className="text-sm text-asphalt-300">{content.body}</p>
              <span className="mt-auto inline-flex items-center gap-2 font-display font-bold uppercase tracking-wide text-race-400">
                En savoir plus
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
