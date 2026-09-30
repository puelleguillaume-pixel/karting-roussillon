import type { ElementType, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/** Petit libellé au-dessus des titres, marqué d'un carré de damier. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-center gap-2.5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-race-400', className)}>
      <span aria-hidden className="checker size-3 text-race-400 [--checker:6px]" />
      {children}
    </p>
  );
}

interface SectionHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
  as?: ElementType;
  id?: string;
  className?: string;
}

export function SectionHeader({ eyebrow, title, intro, actions, as: Heading = 'h2', id, className }: SectionHeaderProps) {
  return (
    <div className={cx('flex flex-col gap-6 md:flex-row md:items-end md:justify-between', className)}>
      <div className="flex max-w-3xl flex-col gap-4">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading id={id} className="text-display-lg font-bold uppercase">
          {title}
        </Heading>
        {intro && <p className="max-w-[62ch] text-lg text-asphalt-300">{intro}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

interface SectionProps {
  id?: string;
  tone?: 'base' | 'raised';
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}

export function Section({ id, tone = 'base', className, children, labelledBy }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      // Hors écran, le navigateur saute le calcul de style et de mise en page de
      // la section (chargement plus rapide sur mobile) ; la taille retenue évite
      // que la barre de défilement ne saute
      className={cx('py-16 [content-visibility:auto] [contain-intrinsic-size:auto_640px] sm:py-20 lg:py-24', tone === 'raised' && 'bg-asphalt-900', className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** Bande de vibreur rouge / blanc. */
export function Kerb({ className }: { className?: string }) {
  return <div aria-hidden className={cx('kerb h-1.5 w-full', className)} />;
}
