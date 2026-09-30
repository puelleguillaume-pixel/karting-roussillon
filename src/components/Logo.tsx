import { assetUrl } from '@/lib/assets';
import { cx } from '@/lib/cx';

interface LogoProps {
  logoPath?: string | null;
  alt?: string;
  className?: string;
}

/**
 * Logo du circuit (brand.logo_path, fourni dans /public/images) ;
 * à défaut, logotype typographique provisoire.
 */
export function Logo({ logoPath, alt = 'Karting Roussillon', className }: LogoProps) {
  const src = assetUrl(logoPath);
  if (src) return <img src={src} alt={alt} className={cx('h-9 w-auto', className)} width={140} height={36} />;
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <span aria-hidden className="checker size-7 shrink-0 bg-asphalt-950 text-chalk ring-1 ring-chalk/70 [--checker:7px]" />
      <span className="flex flex-col font-display font-extrabold uppercase leading-[0.85] tracking-[0.04em]">
        <span className="text-[1.05rem] text-chalk">Karting</span>{' '}
        <span className="text-[1.05rem] text-race-400">Roussillon</span>
      </span>
    </span>
  );
}
