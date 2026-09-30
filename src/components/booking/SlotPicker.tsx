import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { useAvailability, useAvailableDays } from '@/lib/booking-queries';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import type { AvailabilitySlot } from '@/lib/data/types';
import { addDays, capitalize, formatDay, formatTime, isoToParisDay, pluralize, todayInParis } from '@/lib/format';

const WINDOW_DAYS = 14;

interface SlotPickerProps {
  productId: string;
  karts: number;
  horizonDays: number;
  day: string | null;
  selected: AvailabilitySlot[];
  required: number;
  minGapMin: number;
  onSelectDay: (day: string) => void;
  onToggleSlot: (slot: AvailabilitySlot, day: string) => void;
}

function overlaps(a: AvailabilitySlot, b: AvailabilitySlot, gapMin: number): boolean {
  const gap = gapMin * 60_000;
  const aStart = new Date(a.starts_at).getTime();
  const aEnd = new Date(a.ends_at).getTime();
  const bStart = new Date(b.starts_at).getTime();
  const bEnd = new Date(b.ends_at).getTime();
  return aStart < bEnd + gap && bStart < aEnd + gap;
}

export function SlotPicker({ productId, karts, horizonDays, day, selected, required, minGapMin, onSelectDay, onToggleSlot }: SlotPickerProps) {
  const today = todayInParis();
  const lastDay = addDays(today, horizonDays);
  const [windowStart, setWindowStart] = useState(() => (day && day > today ? addDays(day, -((dayIndex(day, today)) % WINDOW_DAYS)) : today));
  const windowEnd = minDay(addDays(windowStart, WINDOW_DAYS - 1), lastDay);
  const days = useAvailableDays(productId, windowStart, windowEnd, karts);

  // Jour affiché : celui choisi, sinon le premier jour disponible de la fenêtre
  const firstAvailable = days.data?.find((d) => d.available_slots > 0)?.day ?? null;
  const shownDay = day ?? firstAvailable;
  const slots = useAvailability(productId, shownDay, karts);

  const groups = new Map<string, { name: string; slots: AvailabilitySlot[] }>();
  for (const slot of slots.data ?? []) {
    const group = groups.get(slot.track_id) ?? { name: slot.track_name, slots: [] };
    group.slots.push(slot);
    groups.set(slot.track_id, group);
  }
  const full = required > 1 && selected.length >= required;

  return (
    <div className="flex flex-col gap-6">
      {/* Choix du jour */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold uppercase">Date</h3>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setWindowStart(maxDay(addDays(windowStart, -WINDOW_DAYS), today))}
              disabled={windowStart <= today}
              className="flex size-10 items-center justify-center bg-asphalt-900 ring-1 ring-asphalt-800 disabled:opacity-30"
            >
              <ChevronLeft aria-hidden className="size-5" />
              <span className="sr-only">Dates précédentes</span>
            </button>
            <button
              type="button"
              onClick={() => setWindowStart(addDays(windowStart, WINDOW_DAYS))}
              disabled={addDays(windowStart, WINDOW_DAYS) > lastDay}
              className="flex size-10 items-center justify-center bg-asphalt-900 ring-1 ring-asphalt-800 disabled:opacity-30"
            >
              <ChevronRight aria-hidden className="size-5" />
              <span className="sr-only">Dates suivantes</span>
            </button>
          </div>
        </div>
        {days.isError ? (
          <ErrorPanel message={errorMessage(days.error)} onRetry={() => days.refetch()} />
        ) : (
          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
            {(days.data ?? Array.from({ length: 7 }, (_, i) => ({ day: addDays(windowStart, i), available_slots: -1 }))).map((d) => {
              const isShown = d.day === shownDay;
              const loading = d.available_slots < 0;
              const closed = d.available_slots === 0;
              return (
                <li key={d.day} className="snap-start">
                  <button
                    type="button"
                    disabled={loading || closed}
                    aria-pressed={isShown}
                    onClick={() => onSelectDay(d.day)}
                    className={cx(
                      'flex w-[4.75rem] shrink-0 flex-col items-center gap-0.5 px-2 py-2.5 ring-1 transition-colors sm:w-full',
                      isShown ? 'bg-race-600 text-white ring-race-600' : 'bg-asphalt-900 ring-asphalt-800 hover:ring-asphalt-500',
                      (loading || closed) && 'opacity-40',
                    )}
                  >
                    <span className="text-xs uppercase tracking-wide">{formatDay(d.day, { weekday: 'short' }).replace('.', '')}</span>
                    <span className="font-display text-2xl font-bold leading-none tabular">{Number(d.day.slice(8))}</span>
                    <span className="text-xs">{formatDay(d.day, { month: 'short' }).replace('.', '')}</span>
                    <span className={cx('mt-1 text-[0.7rem] font-semibold', isShown ? 'text-white' : closed ? 'text-asphalt-400' : 'text-flag-green')}>
                      {loading ? '…' : closed ? 'Complet' : `${d.available_slots} dispo`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Choix du ou des créneaux */}
      <div className="flex flex-col gap-3" aria-live="polite">
        <h3 className="font-display text-lg font-bold uppercase">
          {shownDay ? capitalize(formatDay(shownDay)) : 'Créneaux'}
          {required > 1 && (
            <span className="ml-2 text-base font-semibold normal-case text-asphalt-300">
              · {selected.length}/{required} sessions choisies
            </span>
          )}
        </h3>
        {!shownDay && !days.isPending ? (
          <EmptyState title="Aucune date disponible">Essayez les dates suivantes ou moins de karts.</EmptyState>
        ) : slots.isPending || days.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : slots.isError ? (
          <ErrorPanel message={errorMessage(slots.error)} onRetry={() => slots.refetch()} />
        ) : groups.size === 0 ? (
          <EmptyState title="Aucun créneau ce jour-là">Choisissez une autre date.</EmptyState>
        ) : (
          [...groups.entries()].map(([trackId, group]) => (
            <div key={trackId} className="flex flex-col gap-2">
              {groups.size > 1 && <p className="text-sm font-semibold uppercase tracking-wide text-asphalt-400">{group.name}</p>}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {group.slots.map((slot) => {
                  const isSelected = selected.some((s) => s.slot_id === slot.slot_id);
                  const conflict = !isSelected && selected.some((s) => overlaps(s, slot, minGapMin));
                  const disabled = !isSelected && (!slot.available || conflict || full);
                  const low = slot.available && slot.remaining <= 2;
                  return (
                    <li key={slot.slot_id}>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-pressed={isSelected}
                        onClick={() => onToggleSlot(slot, isoToParisDay(slot.starts_at))}
                        className={cx(
                          'flex w-full flex-col items-center gap-0.5 px-1 py-2.5 ring-1 transition-colors',
                          isSelected ? 'bg-race-600 text-white ring-race-600' : 'bg-asphalt-900 ring-asphalt-800 hover:ring-race-400',
                          disabled && 'cursor-not-allowed opacity-35 hover:ring-asphalt-800',
                        )}
                      >
                        <span className="font-display text-xl font-bold tabular">{formatTime(slot.starts_at)}</span>
                        <span className={cx('text-[0.7rem]', isSelected ? 'text-white' : low ? 'text-flag-yellow' : 'text-asphalt-400')}>
                          {!slot.available ? 'Complet' : low ? (slot.remaining === 1 ? 'Dernière place' : `Plus que ${slot.remaining}`) : pluralize(slot.remaining, 'place')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function dayIndex(day: string, from: string): number {
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function minDay(a: string, b: string) {
  return a < b ? a : b;
}

function maxDay(a: string, b: string) {
  return a > b ? a : b;
}
