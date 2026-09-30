import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Product } from '@/lib/data/types';
import type { AvailabilitySlot } from '@/lib/data/types';
import { capitalize, formatDay, formatPrice, formatTime, isoToParisDay, pluralize } from '@/lib/format';

interface SummaryProps {
  product: Product;
  karts: number;
  seats: number;
  slots: AvailabilitySlot[];
  passengers: number;
  giftAppliedCents?: number;
  footer?: ReactNode;
}

/** Récapitulatif permanent du parcours (colonne de droite / bas de page sur mobile). */
export function BookingSummary({ product, karts, seats, slots, passengers, giftAppliedCents = 0, footer }: SummaryProps) {
  const total = (product.price_cents ?? 0) * karts;
  const due = Math.max(total - giftAppliedCents, 0);
  return (
    <aside aria-label="Récapitulatif" className="flex flex-col gap-5 bg-asphalt-900 p-5 ring-1 ring-asphalt-800 lg:sticky lg:top-28">
      <div className="flex flex-col gap-1">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-asphalt-400">Votre réservation</p>
        <p className="font-display text-2xl font-bold uppercase leading-tight">{product.name}</p>
        <p className="text-sm text-asphalt-400">
          {product.pack ? `${product.pack.sessions_count} × ${product.pack.session_min} min` : `${product.duration_min} min`} · {product.age_label}
        </p>
      </div>
      <dl className="flex flex-col gap-3 border-t border-asphalt-800 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-asphalt-400">{seats > 1 ? 'Karts biplaces' : 'Karts'}</dt>
          <dd className="font-semibold tabular">{karts}</dd>
        </div>
        {passengers > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-asphalt-400">Passagers</dt>
            <dd className="font-semibold tabular">{passengers}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-asphalt-400">{slots.length > 1 ? 'Sessions' : 'Créneau'}</dt>
          <dd className="text-right font-semibold">
            {slots.length === 0 ? (
              <span className="font-normal text-asphalt-400">À choisir</span>
            ) : (
              <>
                <span className="block">{capitalize(formatDay(isoToParisDay(slots[0]!.starts_at), { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
                {slots.map((slot) => (
                  <span key={slot.slot_id} className="block tabular">
                    {formatTime(slot.starts_at)} · {slot.track_name}
                  </span>
                ))}
              </>
            )}
          </dd>
        </div>
      </dl>
      <dl className="flex flex-col gap-2 border-t border-asphalt-800 pt-4">
        <div className="flex justify-between gap-4 text-sm">
          <dt className="text-asphalt-400">
            {formatPrice(product.price_cents ?? 0)} × {pluralize(karts, 'kart')}
          </dt>
          <dd className="tabular">{formatPrice(total)}</dd>
        </div>
        {giftAppliedCents > 0 && (
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-asphalt-400">Bon cadeau</dt>
            <dd className="tabular text-flag-green">− {formatPrice(giftAppliedCents)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-display text-lg font-bold uppercase">À régler sur place</dt>
          <dd className="font-display text-3xl font-extrabold tabular">{formatPrice(due)}</dd>
        </div>
      </dl>
      <p className="flex gap-2 text-xs text-asphalt-400">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Aucun paiement en ligne : vous réglez à l'accueil du circuit, le jour de votre venue.
      </p>
      {footer}
    </aside>
  );
}
