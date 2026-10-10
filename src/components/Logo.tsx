import { assetUrl } from '@/lib/assets';
import { cx } from '@/lib/cx';

interface LogoProps {
  logoPath?: string | null;
  alt?: string;
  className?: string;
}

/**
 * Logo du circuit : brand.logo_path s'il est renseigné dans l'espace dirigeant
 * (fichier de public/images ou URL), sinon le logotype typographique ci-dessous.
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
    <span role="img" aria-label={alt} className={cx('inline-flex h-11 shrink-0 select-none items-center gap-2.5 self-start lg:h-12', className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-full w-auto shrink-0">
        <rect width="24" height="24" fill="var(--color-race-600)" />
        {[0, 1, 2, 3].flatMap((row) =>
          [0, 1, 2, 3].map((col) =>
            (row + col) % 2 === 0 ? <rect key={`${row}-${col}`} x={2 + col * 5} y={2 + row * 5} width="5" height="5" fill="var(--color-chalk)" /> : null,
          ),
        )}
      </svg>
      <span aria-hidden className="flex flex-col font-display uppercase leading-none">
        <span className="text-[0.7rem] font-semibold tracking-[0.42em] text-race-400 lg:text-xs">Karting de</span>
        <span className="text-[1.6rem] font-extrabold tracking-wide text-chalk lg:text-[1.75rem]">Torreilles</span>
      </span>
    </span>
  );
}
