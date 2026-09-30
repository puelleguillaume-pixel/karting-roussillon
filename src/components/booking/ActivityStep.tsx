import { ArrowRight, CalendarDays, PartyPopper } from 'lucide-react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { isInSeason, tracksOf, type Catalog } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import type { Product } from '@/lib/data/types';
import { formatLength, formatPrice } from '@/lib/format';

function ProductChoice({ product, catalog, onSelect }: { product: Product; catalog: Catalog; onSelect: (slug: string) => void }) {
  const tracks = tracksOf(product, catalog);
  return (
    <button
      type="button"
      onClick={() => onSelect(product.slug)}
      className="group flex h-full w-full flex-col gap-3 bg-asphalt-900 p-5 text-left ring-1 ring-asphalt-800 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:ring-race-500"
    >
      <span className="flex items-start justify-between gap-4">
        <span className="font-display text-xl font-bold uppercase leading-tight">{product.name}</span>
        {product.price_cents !== null && <span className="font-display text-3xl font-extrabold tabular">{formatPrice(product.price_cents)}</span>}
      </span>
      <span className="flex flex-wrap gap-2">
        <Chip>{product.pack ? `${product.pack.sessions_count} × ${product.pack.session_min} min` : `${product.duration_min} min`}</Chip>
        {product.age_label && <Chip tone="outline">{product.age_label}</Chip>}
        {tracks.map((track) => (
          <Chip key={track.id} tone="outline">
            {track.length_m ? formatLength(track.length_m) : track.short_name}
          </Chip>
        ))}
      </span>
      <span className="mt-auto inline-flex items-center gap-2 pt-1 font-display text-sm font-bold uppercase tracking-wide text-race-400">
        Choisir
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

export function ActivityStep({ catalog, onSelect }: { catalog: Catalog; onSelect: (slug: string) => void }) {
  const sessions = catalog.sessions.filter((p) => p.is_online_bookable && isInSeason(p));
  const packs = catalog.packs.filter((p) => p.is_online_bookable && isInSeason(p));
  const groups: Array<{ title: string; items: Product[] }> = [
    { title: 'Sessions', items: sessions },
    { title: 'Packs KR', items: packs },
  ];

  return (
    <div className="flex flex-col gap-10">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.title} className="flex flex-col gap-4" aria-labelledby={`groupe-${group.title}`}>
            <h2 id={`groupe-${group.title}`} className="font-display text-2xl font-bold uppercase">
              {group.title}
            </h2>
            <ul className={cx('grid gap-3 sm:grid-cols-2', group.items.length > 4 && 'xl:grid-cols-3')}>
              {group.items.map((product) => (
                <li key={product.id}>
                  <ProductChoice product={product} catalog={catalog} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/formules" className="flex items-center gap-3 bg-asphalt-900 p-4 ring-1 ring-asphalt-800 hover:ring-race-500">
          <PartyPopper aria-hidden className="size-6 shrink-0 text-race-400" />
          <span>
            <span className="block font-semibold">Anniversaire, EVG, team building ?</span>
            <span className="text-sm text-asphalt-400">Faites une demande depuis la page Formules.</span>
          </span>
        </Link>
        <Link to="/trackday" className="flex items-center gap-3 bg-asphalt-900 p-4 ring-1 ring-asphalt-800 hover:ring-race-500">
          <CalendarDays aria-hidden className="size-6 shrink-0 text-race-400" />
          <span>
            <span className="block font-semibold">Trackdays et droits de piste</span>
            <span className="text-sm text-asphalt-400">Places à réserver depuis le calendrier.</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
