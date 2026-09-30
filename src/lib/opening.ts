import type { OpeningHours } from '@/lib/data/types';
import { formatClock, todayInParis } from '@/lib/format';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export interface OpeningLine {
  days: string;
  hours: string;
}

/**
 * Horaires du site en vigueur aujourd'hui (lignes sans piste), regroupés :
 * « Tous les jours · 9h00 – 19h00 » ou une ligne par plage de jours.
 */
export function summarizeOpening(rows: OpeningHours[]): OpeningLine[] {
  const today = todayInParis();
  const current = rows.filter(
    (r) => r.track_id === null && (!r.valid_from || r.valid_from <= today) && (!r.valid_to || r.valid_to >= today),
  );
  const byDay = new Map<number, OpeningHours>();
  for (const row of current.sort((a, b) => b.priority - a.priority)) {
    if (!byDay.has(row.weekday)) byDay.set(row.weekday, row);
  }
  const label = (r: OpeningHours | undefined) =>
    !r || r.is_closed ? 'Fermé' : `${formatClock(r.opens_at)} – ${formatClock(r.closes_at)}`;

  const lines: OpeningLine[] = [];
  let start = 1;
  for (let day = 1; day <= 7; day++) {
    const next = day < 7 ? label(byDay.get(day + 1)) : null;
    const value = label(byDay.get(day));
    if (next !== value) {
      const days =
        start === 1 && day === 7
          ? 'Tous les jours'
          : start === day
            ? capitalizeFirst(WEEKDAYS[day - 1]!)
            : `Du ${WEEKDAYS[start - 1]} au ${WEEKDAYS[day - 1]}`;
      lines.push({ days, hours: value });
      start = day + 1;
    }
  }
  return lines;
}

function capitalizeFirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
