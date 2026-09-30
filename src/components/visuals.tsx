import { useReducedMotion } from 'framer-motion';
import { Accessibility } from 'lucide-react';
import { useId } from 'react';
import { assetUrl, responsiveVariants } from '@/lib/assets';
import { cx } from '@/lib/cx';
import type { VehicleType } from '@/lib/data/types';
import { TRACK_PATHS, type TrackShape } from './trackShapes';

// -----------------------------------------------------------------------------
// Tracés stylisés des pistes (illustrations, pas des plans à l'échelle)
// -----------------------------------------------------------------------------
interface TrackIllustrationProps {
  shape: TrackShape;
  className?: string;
  animated?: boolean;
  title?: string;
}

export function TrackIllustration({ shape, className, animated = true, title }: TrackIllustrationProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const d = TRACK_PATHS[shape];
  const [, sx = '0', sy = '0'] = /^M(\d+)\s(\d+)/.exec(d) ?? [];
  const startX = Number(sx);
  const startY = Number(sy);
  return (
    <svg viewBox="0 0 400 260" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <pattern id={`checker-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" className="fill-asphalt-950" />
          <rect width="3" height="3" className="fill-chalk" />
          <rect x="3" y="3" width="3" height="3" className="fill-chalk" />
        </pattern>
      </defs>
      {/* Vibreurs : bordure blanche, pointillés rouges, puis bitume par-dessus */}
      <path d={d} className="fill-none stroke-chalk" strokeWidth={26} strokeLinejoin="round" />
      <path d={d} className="fill-none stroke-race-600" strokeWidth={26} strokeLinejoin="round" strokeDasharray="7 7" />
      <path d={d} className="fill-none stroke-asphalt-700" strokeWidth={21} strokeLinejoin="round" />
      <path d={d} className="fill-none stroke-chalk/15" strokeWidth={1} strokeDasharray="4 8" />
      {animated && (
        <path
          d={d}
          pathLength={1000}
          className="kr-racing-line fill-none stroke-race-400"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="90 910"
          strokeDashoffset={1000}
        />
      )}
      <rect x={startX - 11} y={startY - 5} width={22} height={10} fill={`url(#checker-${uid})`} className="stroke-chalk" strokeWidth={0.75} />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Image stockée en base, avec repli
// -----------------------------------------------------------------------------
export function MediaImage({
  path,
  alt,
  className,
  priority,
  sizes = '100vw',
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  /** Largeur d'affichage (attribut sizes) pour choisir la bonne variante */
  sizes?: string;
}) {
  const src = assetUrl(path);
  if (!src) return null;
  const variants = responsiveVariants(path);
  const img = (
    <img
      src={src}
      alt={alt}
      width={variants?.width}
      height={variants?.height}
      sizes={variants ? sizes : undefined}
      className={cx('h-full w-full object-cover', className)}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
    />
  );
  if (!variants) return img;
  // Variantes AVIF / WebP générées par scripts/optimize-images.mjs
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={variants.srcSet('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={variants.srcSet('webp')} sizes={sizes} />
      {img}
    </picture>
  );
}

// -----------------------------------------------------------------------------
// Visuel de kart : photo si disponible, sinon vignette typographique
// -----------------------------------------------------------------------------
export function KartVisual({ vehicle, className }: { vehicle: VehicleType; className?: string }) {
  const photo = assetUrl(vehicle.image_path);
  return (
    <div className={cx('relative aspect-[4/3] overflow-hidden bg-asphalt-850', className)}>
      {photo ? (
        <MediaImage path={vehicle.image_path} alt={vehicle.name} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
      ) : (
        <>
          <div aria-hidden className="speed-lines absolute inset-0" />
          <div aria-hidden className="checker absolute -right-6 -top-6 size-24 rotate-12 text-chalk/[0.07] [--checker:12px]" />
          <span
            aria-hidden
            className="text-outline absolute bottom-5 left-4 font-display text-[clamp(3.5rem,9vw,5.5rem)] font-extrabold uppercase leading-none tracking-tight text-chalk/35 [--outline:1.5px]"
          >
            {vehicle.short_label || vehicle.name}
          </span>
          {vehicle.engine && (
            <span className="absolute left-4 top-4 font-display text-sm font-semibold uppercase tracking-[0.14em] text-asphalt-300">
              {vehicle.engine}
            </span>
          )}
        </>
      )}
      {vehicle.is_adapted && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 bg-flag-blue px-2 py-1 text-xs font-semibold text-asphalt-950">
          <Accessibility aria-hidden className="size-3.5" />
          Kart adapté
        </span>
      )}
      <div aria-hidden className="kerb absolute inset-x-0 bottom-0 h-1.5" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fond du hero : vidéo, photo, ou illustration de circuit
// -----------------------------------------------------------------------------
interface HeroBackdropProps {
  image?: string | null;
  video?: string | null;
  poster?: string | null;
  alt: string;
}

export function HeroBackdrop({ image, video, poster, alt }: HeroBackdropProps) {
  const reduceMotion = useReducedMotion();
  const videoSrc = assetUrl(video);
  const posterSrc = assetUrl(poster) ?? assetUrl(image);
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {videoSrc ? (
        <video
          className="h-full w-full object-cover"
          src={videoSrc}
          poster={posterSrc ?? undefined}
          autoPlay={!reduceMotion}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        />
      ) : image ? (
        <MediaImage path={image} alt={alt} priority />
      ) : (
        <div className="absolute inset-0 bg-asphalt-950">
          <div aria-hidden className="speed-lines absolute inset-0 opacity-60" />
          <TrackIllustration
            shape="medium"
            className="absolute -right-[18%] top-1/2 w-[125%] max-w-none -translate-y-1/2 opacity-50 sm:-right-[8%] sm:w-[92%] lg:-right-[4%] lg:w-[68%] lg:opacity-90"
          />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 bg-linear-to-r from-asphalt-950 via-asphalt-950/80 to-asphalt-950/10" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-asphalt-950 to-transparent" />
    </div>
  );
}
