import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'light' | 'dark' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

// Le fond biseauté est porté par un pseudo-élément : le contour de focus
// du bouton lui-même n'est donc jamais rogné par le clip-path.
const BASE =
  'relative isolate inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-display font-bold uppercase tracking-[0.06em] transition-[color,transform] duration-150 ease-race active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const SIZES: Record<Size, string> = {
  sm: 'h-10 px-4 text-[0.95rem] [--notch:8px]',
  md: 'h-12 px-6 text-base [--notch:10px]',
  lg: 'h-14 px-8 text-lg [--notch:12px]',
};

const FILL = 'before:absolute before:inset-0 before:-z-10 before:notch before:transition-colors';

const VARIANTS: Record<Variant, string> = {
  primary: cx(FILL, 'text-white before:bg-race-600 hover:before:bg-race-500'),
  secondary: cx(FILL, 'text-chalk before:bg-chalk/12 hover:before:bg-chalk/20'),
  light: cx(FILL, 'text-asphalt-950 before:bg-chalk hover:before:bg-white'),
  dark: cx(FILL, 'text-chalk before:bg-asphalt-950 hover:before:bg-black'),
  ghost: 'text-chalk hover:text-race-400',
};

function buttonClasses({ variant = 'primary', size = 'md', block }: StyleProps = {}, className?: string) {
  return cx(BASE, SIZES[size], VARIANTS[variant], block && 'w-full', variant === 'ghost' && 'px-1', className);
}

export function Button({ variant, size, block, className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return <button type={type} className={buttonClasses({ variant, size, block }, className)} {...props} />;
}

export function ButtonLink({ variant, size, block, className, ...props }: LinkProps & StyleProps) {
  return <Link className={buttonClasses({ variant, size, block }, className)} {...props} />;
}

export function ButtonAnchor({ variant, size, block, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & StyleProps) {
  return <a className={buttonClasses({ variant, size, block }, className)} {...props} />;
}
