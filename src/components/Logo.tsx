import { assetUrl } from '@/lib/assets';
import { cx } from '@/lib/cx';

interface LogoProps {
  logoPath?: string | null;
  alt?: string;
  className?: string;
}

/** Logo officiel, version pour fond sombre (public/images/logo.png, 380 × 161). */
const DEFAULT_LOGO = 'logo.png';

/**
 * Logo du circuit : brand.logo_path s'il est renseigné dans l'espace dirigeant,
 * sinon le logo officiel livré avec le site.
 * self-start + shrink-0 + object-contain : jamais étiré, même dans une colonne flex.
 */
export function Logo({ logoPath, alt = 'Karting Roussillon', className }: LogoProps) {
  const src = assetUrl(logoPath || DEFAULT_LOGO) ?? `/images/${DEFAULT_LOGO}`;
  return (
    <img
      src={src}
      alt={alt}
      className={cx('h-11 w-auto max-w-full shrink-0 self-start object-contain object-left lg:h-12', className)}
      width={380}
      height={161}
      decoding="async"
    />
  );
}
