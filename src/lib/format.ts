export const TIME_ZONE = 'Europe/Paris';

const euroWhole = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euroCents = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const integer = new Intl.NumberFormat('fr-FR');

/** 2400 → « 24 € », 1750 → « 17,50 € » */
export function formatPrice(cents: number): string {
  return cents % 100 === 0 ? euroWhole.format(cents / 100) : euroCents.format(cents / 100);
}

/** 1019 → « 1 019 m » */
export function formatLength(meters: number): string {
  return `${integer.format(meters)} m`;
}

/** 130 → « 1,30 m » */
export function formatHeight(cm: number): string {
  return `${(cm / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

/** Format écran de chronométrage : 38950 → « 38.950 », 62345 → « 1:02.345 » */
export function formatLapTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = String(ms % 1000).padStart(3, '0');
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}.${millis}` : `${seconds}.${millis}`;
}

/** Écart au meilleur temps : « +0.462 » */
export function formatGap(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}`;
}

/** Date du jour à Paris, au format AAAA-MM-JJ */
export function todayInParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

/** Décale une date AAAA-MM-JJ de n jours (calendrier civil, sans fuseau) */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Midi UTC du jour civil : s'affiche au bon jour dans tous les fuseaux européens */
export function dayToDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDay(day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, ...options }).format(dayToDate(day));
}

/** Instant ISO → « 9h00 » (heure de Paris) */
export function formatTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${Number(hour)}h${minute}`;
}

/** « 09:00 » (heure SQL) → « 9h00 » */
export function formatClock(hhmm: string): string {
  const [h = '0', m = '00'] = hhmm.split(':');
  return `${Number(h)}h${m}`;
}

/** Jour local (Paris) d'un instant ISO, au format AAAA-MM-JJ */
export function isoToParisDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso));
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatInteger(count)} ${count > 1 ? plural : singular}`;
}
