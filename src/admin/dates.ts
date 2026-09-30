import { addDays } from '@/lib/format';

/** Jour ISO de la semaine (1 = lundi … 7 = dimanche) d'une date AAAA-MM-JJ */
export function isoWeekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Lundi de la semaine d'une date */
export function startOfWeek(day: string): string {
  return addDays(day, 1 - isoWeekdayOf(day));
}

/** Premier et dernier jour du mois d'une date */
export function monthRange(day: string): { first: string; last: string } {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

/** Décale d'un nombre de mois (au 1er du mois) */
export function shiftMonth(day: string, delta: number): string {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** Liste des jours entre deux dates incluses */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
