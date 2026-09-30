import { Check, Flag, Route } from 'lucide-react';
import type { ReactNode } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Eyebrow } from '@/components/ui/layout';
import type { Product } from '@/lib/data/types';
import { formatLength, formatPrice } from '@/lib/format';

/** Carte d'une offre sur demande (formule anniversaire, expérience Alpine…) */
export function OfferCard({ product }: { product: Product }) {
  const { includes, laps, track_length_m: trackLength, extra_lap_note: extraLapNote } = product.metadata;
  return (
    <article className="flex h-full flex-col gap-5 bg-asphalt-900 p-6 ring-1 ring-asphalt-800">
      <div className="flex flex-col gap-2">
        <h3 className="text-display-sm font-bold uppercase">{product.name}</h3>
        {product.short_description && <p className="text-asphalt-300">{product.short_description}</p>}
      </div>
      {(laps || trackLength) && (
        <div className="flex flex-wrap gap-2">
          {laps && <Chip icon={<Flag />}>{laps} tours</Chip>}
          {trackLength && (
            <Chip tone="outline" icon={<Route />}>
              Circuit de {formatLength(trackLength)}
            </Chip>
          )}
        </div>
      )}
      {includes && includes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {includes.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-asphalt-200">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-race-400" />
              {item}
            </li>
          ))}
        </ul>
      )}
      {product.description && <p className="text-sm text-asphalt-300">{product.description}</p>}
      <div className="mt-auto flex flex-col gap-1 border-t border-asphalt-800 pt-4">
        <p className="font-display text-2xl font-bold uppercase">
          {product.price_cents !== null ? formatPrice(product.price_cents) : (product.price_label ?? 'Sur demande')}
        </p>
        {extraLapNote && <p className="text-sm text-asphalt-400">{extraLapNote}</p>}
      </div>
    </article>
  );
}

/** Mise en page « offres + formulaire de demande » des pages formules. */
export function OfferLayout({ offers, formTitle, form }: { offers: ReactNode; formTitle: string; form: ReactNode }) {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <div className="flex flex-col gap-4">{offers}</div>
      <div id="demande" className="scroll-mt-28 bg-asphalt-900 p-6 ring-1 ring-asphalt-800 sm:p-8 lg:sticky lg:top-28">
        <div className="mb-6 flex flex-col gap-3">
          <Eyebrow>Demande en ligne</Eyebrow>
          <h2 className="text-display-md font-bold uppercase">{formTitle}</h2>
        </div>
        {form}
      </div>
    </div>
  );
}
