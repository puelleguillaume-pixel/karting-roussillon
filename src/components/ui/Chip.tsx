import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'neutral' | 'red' | 'green' | 'yellow' | 'blue' | 'outline';

const TONES: Record<Tone, string> = {
  neutral: 'bg-asphalt-700 text-chalk',
  red: 'bg-race-600 text-white',
  green: 'bg-flag-green/15 text-flag-green ring-1 ring-inset ring-flag-green/40',
  yellow: 'bg-flag-yellow/15 text-flag-yellow ring-1 ring-inset ring-flag-yellow/40',
  blue: 'bg-flag-blue/15 text-flag-blue ring-1 ring-inset ring-flag-blue/40',
  outline: 'text-asphalt-200 ring-1 ring-inset ring-asphalt-600',
};

export function Chip({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[0.8125rem] font-medium leading-none tabular',
        TONES[tone],
        className,
      )}
    >
      {icon && <span aria-hidden className="shrink-0 [&>svg]:size-3.5">{icon}</span>}
      {children}
    </span>
  );
}
