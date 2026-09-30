import { ACCESS_STATUS, BLOCK_REASON_LABELS, EVENT_KIND_LABELS } from '@/lib/catalog';
import type { CalendarItem, TrackAccessStatus } from '@/lib/data/types';
import { dayToDate, isoToParisDay } from '@/lib/format';

// -----------------------------------------------------------------------------
// Utilitaires calendrier
// -----------------------------------------------------------------------------
export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}`, days: last };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function isoWeekday(day: string): number {
  return ((dayToDate(day).getUTCDay() + 6) % 7) + 1;
}

/** Jours locaux couverts par un événement / blocage */
function coversDay(item: CalendarItem, day: string): boolean {
  if (!item.starts_at || !item.ends_at) return item.day === day;
  const first = isoToParisDay(item.starts_at);
  const last = isoToParisDay(new Date(new Date(item.ends_at).getTime() - 1).toISOString());
  return first <= day && day <= last;
}

function blockStatus(reason: string): TrackAccessStatus {
  if (reason === 'trackday') return 'trackday';
  if (reason === 'weather' || reason === 'maintenance') return 'closed';
  return 'private';
}

export function itemLabel(item: CalendarItem): string {
  if (item.title) return item.title;
  if (item.item_type === 'event') return EVENT_KIND_LABELS[item.status] ?? 'Événement';
  if (item.item_type === 'block') return BLOCK_REASON_LABELS[item.status] ?? 'Fermeture';
  return ACCESS_STATUS[item.status as TrackAccessStatus]?.label ?? item.status;
}

export interface DayInfo {
  status: TrackAccessStatus;
  label: string;
  items: CalendarItem[];
}

export function dayInfo(items: CalendarItem[], day: string, trackSlug: string): DayInfo | null {
  const onTrack = items.filter((i) => i.track_slugs.includes(trackSlug) && coversDay(i, day));
  if (onTrack.length === 0) return null;
  const explicit = onTrack.find((i) => i.item_type === 'track_status');
  if (explicit) {
    const status = explicit.status as TrackAccessStatus;
    return { status, label: explicit.title || ACCESS_STATUS[status].label, items: onTrack };
  }
  const event = onTrack.find((i) => i.item_type === 'event');
  if (event) return { status: 'trackday', label: itemLabel(event), items: onTrack };
  const block = onTrack[0]!;
  return { status: blockStatus(block.status), label: itemLabel(block), items: onTrack };
}

export const STATUS_SWATCH: Record<TrackAccessStatus, string> = {
  open: 'bg-flag-green',
  restricted: 'bg-flag-yellow',
  closed: 'bg-race-500',
  trackday: 'bg-flag-blue',
  private: 'checker bg-asphalt-950 text-chalk [--checker:6px]',
};
