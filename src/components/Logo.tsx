import { assetUrl } from '@/lib/assets';
import { cx } from '@/lib/cx';

interface LogoProps {
  logoPath?: string | null;
  alt?: string;
  className?: string;
}

/** Logo officiel (badge rond, public/images/logo.png, 192 × 192) */
const DEFAULT_LOGO = 'logo.png';

/**
 * Logo du circuit : brand.logo_path s'il est renseigné dans l'espace dirigeant
 * (fichier de public/images ou URL), sinon le badge officiel suivi du nom.
 * self-start + shrink-0 + object-contain : jamais étiré, même dans une colonne flex.
 */
export function Logo({ logoPath, alt = 'Karting de Torreilles', className }: LogoProps) {
  const src = assetUrl(logoPath);
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cx('h-11 w-auto max-w-full shrink-0 self-start object-contain object-left lg:h-12', className)}
        decoding="async"
      />
    );
  }
  return (
    <span className={cx('inline-flex h-12 shrink-0 items-center gap-3 self-start lg:h-14', className)}>
      <img src={`/images/${DEFAULT_LOGO}`} alt={alt} width={192} height={192} decoding="async" className="aspect-square h-full w-auto shrink-0" />
      <span aria-hidden className="flex flex-col font-display uppercase leading-none">
        <span className="text-[0.7rem] font-semibold tracking-[0.42em] text-race-400 lg:text-xs">Karting de</span>
        <span className="text-[1.6rem] font-extrabold tracking-wide text-chalk lg:text-[1.75rem]">Torreilles</span>
      </span>
    </span>
  );
}
