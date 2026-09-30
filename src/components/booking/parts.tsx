import { Check, Minus, Plus, Timer } from 'lucide-react';
import { cx } from '@/lib/cx';
import { STEPS } from './flow';

// -----------------------------------------------------------------------------
// Étapes du parcours
// -----------------------------------------------------------------------------
export function Stepper({ current, onNavigate }: { current: number; onNavigate?: (step: number) => void }) {
  return (
    <nav aria-label="Étapes de la réservation">
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          const content = (
            <>
              <span
                className={cx(
                  'flex size-7 shrink-0 items-center justify-center font-display text-sm font-bold',
                  active ? 'bg-race-600 text-white' : done ? 'bg-chalk text-asphalt-950' : 'bg-asphalt-800 text-asphalt-400',
                )}
              >
                {done ? <Check aria-hidden className="size-4" /> : step}
              </span>
              <span className={cx('hidden font-display text-sm font-semibold uppercase tracking-wide sm:block', active ? 'text-chalk' : 'text-asphalt-400')}>
                {label}
              </span>
            </>
          );
          return (
            <li key={label} className="flex flex-col gap-2">
              <span aria-hidden className={cx('h-1', active || done ? 'bg-race-600' : 'bg-asphalt-800')} />
              {done && onNavigate ? (
                <button type="button" onClick={() => onNavigate(step)} className="flex items-center gap-2 text-left">
                  {content}
                  <span className="sr-only">Revenir à l'étape {label}</span>
                </button>
              ) : (
                <span className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
                  {content}
                  <span className="sr-only">
                    {active ? `Étape ${step} sur 4 : ${label} (en cours)` : `Étape ${step} : ${label}`}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// -----------------------------------------------------------------------------
// Nombre de karts / pilotes
// -----------------------------------------------------------------------------
export function CountStepper({
  label,
  hint,
  value,
  min = 1,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 bg-asphalt-900 p-4 ring-1 ring-asphalt-800">
      <div className="flex flex-col">
        <span className="font-semibold" id="count-label">
          {label}
        </span>
        {hint && <span className="text-sm text-asphalt-400">{hint}</span>}
      </div>
      <div className="flex items-center gap-1" role="group" aria-labelledby="count-label">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-11 items-center justify-center bg-asphalt-800 text-chalk ring-1 ring-asphalt-700 disabled:opacity-30"
        >
          <Minus aria-hidden className="size-5" />
          <span className="sr-only">Retirer un</span>
        </button>
        <output aria-live="polite" className="w-12 text-center font-display text-3xl font-bold tabular">
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-11 items-center justify-center bg-asphalt-800 text-chalk ring-1 ring-asphalt-700 disabled:opacity-30"
        >
          <Plus aria-hidden className="size-5" />
          <span className="sr-only">Ajouter un</span>
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Compte à rebours du blocage de créneau
// -----------------------------------------------------------------------------
export function HoldTimer({ remainingMs }: { remainingMs: number }) {
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const urgent = remainingMs < 120_000;
  return (
    <p className={cx('flex items-center gap-2 text-sm', urgent ? 'text-flag-yellow' : 'text-asphalt-300')}>
      <Timer aria-hidden className="size-4 shrink-0" />
      <span>
        Créneau réservé pour vous encore{' '}
        <strong className="font-display text-base tabular text-chalk" aria-hidden>
          {minutes}:{String(seconds).padStart(2, '0')}
        </strong>
        <span className="sr-only">
          {minutes} minute{minutes > 1 ? 's' : ''}
        </span>
      </span>
    </p>
  );
}
