import { cx } from '@/lib/cx';

interface GiftCardPreviewProps {
  businessName: string;
  valueLabel: string;
  valueDetail?: string;
  recipientName: string;
  fromName: string;
  message: string;
  validityMonths?: number;
  code?: string;
  className?: string;
}

/** Aperçu du bon tel qu'il sera imprimé (reprend la mise en page du PDF). */
export function GiftCardPreview({ businessName, valueLabel, valueDetail, recipientName, fromName, message, validityMonths, code, className }: GiftCardPreviewProps) {
  const [first = '', ...rest] = businessName.toUpperCase().split(' ');
  return (
    <figure className={cx('overflow-hidden bg-white text-asphalt-950 shadow-2xl shadow-black/60', className)} aria-label="Aperçu du bon cadeau">
      <div className="flex items-center justify-between gap-3 bg-asphalt-950 px-4 py-3 sm:px-5 sm:py-4">
        <p className="font-display text-base font-extrabold tracking-wide sm:text-lg">
          <span className="text-chalk">{first}</span> <span className="text-race-400">{rest.join(' ')}</span>
        </p>
        <p className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.2em] text-chalk sm:text-sm">
          <span aria-hidden className="checker size-4 bg-asphalt-950 text-chalk ring-1 ring-chalk/60 [--checker:4px]" />
          BON CADEAU
        </p>
      </div>
      <div aria-hidden className="h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-race-600)_0_12px,var(--color-chalk)_12px_24px)]" />
      <div className="grid grid-cols-[1fr_auto] gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[0.65rem] font-bold tracking-[0.2em] text-asphalt-500">OFFERT À</p>
          <p className="truncate font-display text-2xl font-bold sm:text-3xl">{recipientName || 'Prénom'}</p>
          {fromName && <p className="truncate text-xs text-asphalt-500">de la part de {fromName}</p>}
          {message && <p className="mt-1 line-clamp-3 text-xs italic leading-snug text-asphalt-800">« {message} »</p>}
          <p className="mt-3 text-[0.65rem] font-bold tracking-[0.2em] text-asphalt-500">VALEUR</p>
          <p className={cx('font-display font-extrabold leading-none', valueDetail ? 'text-xl sm:text-2xl' : 'text-4xl text-race-600')}>{valueLabel}</p>
          {valueDetail && <p className="text-xs text-asphalt-500">{valueDetail}</p>}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div aria-hidden className="checker size-20 bg-white text-asphalt-950/85 ring-1 ring-asphalt-200 [--checker:10px] sm:size-24" />
          <p className="font-mono text-[0.6rem] font-bold tracking-wider">{code ?? 'KDO-····-····-····'}</p>
          {validityMonths && <p className="text-[0.6rem] text-asphalt-500">Valable {validityMonths} mois</p>}
        </div>
      </div>
      <figcaption className="bg-[#f6f6f3] px-4 py-2 text-[0.6rem] text-asphalt-600 sm:px-5">
        À présenter lors de la réservation, en ligne ou à l'accueil.
      </figcaption>
    </figure>
  );
}
