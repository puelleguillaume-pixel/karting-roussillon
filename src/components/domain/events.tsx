import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { dayInfo, isoWeekday, itemLabel, monthBounds, shiftMonth, STATUS_SWATCH, type DayInfo } from '@/lib/calendar';
import { ACCESS_STATUS, BLOCK_REASON_LABELS, EVENT_KIND_LABELS } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import type { CalendarItem, Track, TrackAccessStatus } from '@/lib/data/types';
import { capitalize, formatDay, formatLength, formatTime, pluralize, todayInParis } from '@/lib/format';
import { usePublicCalendar } from '@/lib/queries';

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-asphalt-300" aria-label="Légende">
      {(Object.keys(ACCESS_STATUS) as TrackAccessStatus[]).map((status) => (
        <li key={status} className="flex items-center gap-2">
          <span aria-hidden className={cx('size-3.5 ring-1 ring-black/40', STATUS_SWATCH[status])} />
          <span>
            <span className="font-semibold text-chalk">{ACCESS_STATUS[status].label}</span>
            <span className="text-asphalt-400"> · {ACCESS_STATUS[status].flag}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// -----------------------------------------------------------------------------
// Calendrier mensuel des droits de piste / trackdays
// -----------------------------------------------------------------------------
const WEEKDAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function TrackCalendar({ tracks }: { tracks: Track[] }) {
  const today = todayInParis();
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [trackSlug, setTrackSlug] = useState(tracks[0]?.slug ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const bounds = monthBounds(month);
  const calendar = usePublicCalendar(bounds.first, bounds.last);
  const maxMonth = shiftMonth(currentMonth, 12);

  const days = useMemo(
    () => Array.from({ length: bounds.days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
    [month, bounds.days],
  );
  const infos = useMemo(() => {
    const map = new Map<string, DayInfo | null>();
    for (const day of days) map.set(day, dayInfo(calendar.data ?? [], day, trackSlug));
    return map;
  }, [calendar.data, days, trackSlug]);

  const monthLabel = capitalize(formatDay(bounds.first, { month: 'long', year: 'numeric' }));
  const selectedInfo = selected ? infos.get(selected) : null;
  const leading = isoWeekday(bounds.first) - 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Choisir la piste" className="inline-flex self-start bg-asphalt-900 p-1 ring-1 ring-asphalt-800">
          {tracks.map((track) => (
            <button
              key={track.slug}
              type="button"
              aria-pressed={track.slug === trackSlug}
              onClick={() => {
                setTrackSlug(track.slug);
                setSelected(null);
              }}
              className={cx(
                'px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide transition-colors',
                track.slug === trackSlug ? 'bg-race-600 text-white' : 'text-asphalt-300 hover:text-chalk',
              )}
            >
              {track.short_name}
              {track.length_m ? <span className="ml-1.5 font-medium">{formatLength(track.length_m)}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMonth(shiftMonth(month, -1));
              setSelected(null);
            }}
            disabled={month <= currentMonth}
            className="flex size-10 items-center justify-center bg-asphalt-900 text-chalk ring-1 ring-asphalt-800 disabled:opacity-30"
          >
            <ChevronLeft aria-hidden className="size-5" />
            <span className="sr-only">Mois précédent</span>
          </button>
          <p aria-live="polite" className="min-w-44 text-center font-display text-xl font-bold uppercase">
            {monthLabel}
          </p>
          <button
            type="button"
            onClick={() => {
              setMonth(shiftMonth(month, 1));
              setSelected(null);
            }}
            disabled={month >= maxMonth}
            className="flex size-10 items-center justify-center bg-asphalt-900 text-chalk ring-1 ring-asphalt-800 disabled:opacity-30"
          >
            <ChevronRight aria-hidden className="size-5" />
            <span className="sr-only">Mois suivant</span>
          </button>
        </div>
      </div>

      {calendar.isError ? (
        <ErrorPanel message={errorMessage(calendar.error)} onRetry={() => calendar.refetch()} />
      ) : (
        <div>
          <div aria-hidden className="grid grid-cols-7 gap-1 pb-2 text-center font-display text-sm font-semibold uppercase text-asphalt-400">
            {WEEKDAY_SHORT.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <ol className="grid grid-cols-7 gap-1">
            {Array.from({ length: leading }, (_, i) => (
              <li key={`blank-${i}`} aria-hidden />
            ))}
            {days.map((day) => {
              const info = infos.get(day) ?? null;
              const past = day < today;
              const isSelected = selected === day;
              return (
                <li key={day}>
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : day)}
                    aria-pressed={isSelected}
                    aria-label={`${formatDay(day)} : ${info ? info.label : 'pas d’information'}`}
                    className={cx(
                      'relative flex aspect-square w-full flex-col justify-between overflow-hidden bg-asphalt-900 p-1.5 text-left ring-1 transition-colors sm:aspect-auto sm:h-20 sm:p-2 lg:h-[5.5rem]',
                      isSelected ? 'ring-2 ring-chalk' : day === today ? 'ring-race-400' : 'ring-asphalt-800 hover:ring-asphalt-500',
                      // Jour passé : atténué par la couleur (contraste AA conservé), pas par l'opacité
                      past && 'bg-asphalt-950 text-asphalt-400',
                    )}
                  >
                    <span className="font-display text-base font-semibold tabular sm:text-lg">{Number(day.slice(8))}</span>
                    {calendar.isPending ? (
                      <Skeleton className="h-1.5 w-full" />
                    ) : info ? (
                      <span className="flex flex-col gap-1">
                        <span className="hidden truncate text-[0.7rem] font-medium leading-tight text-asphalt-200 md:block">{info.label}</span>
                        <span aria-hidden className={cx('h-1.5 w-full', STATUS_SWATCH[info.status])} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div aria-live="polite">
        {selected && (
          <div className="flex flex-col gap-3 border-l-4 border-race-600 bg-asphalt-900 p-5">
            <p className="font-display text-xl font-bold uppercase">{capitalize(formatDay(selected))}</p>
            {selectedInfo ? (
              <ul className="flex flex-col gap-2">
                {selectedInfo.items.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    {item.item_type === 'track_status' ? (
                      <span aria-hidden className={cx('size-3 ring-1 ring-black/40', STATUS_SWATCH[item.status as TrackAccessStatus])} />
                    ) : null}
                    <span className="font-semibold">{itemLabel(item)}</span>
                    {item.starts_at && item.ends_at && (
                      <span className="text-sm text-asphalt-400">
                        {formatTime(item.starts_at)} – {formatTime(item.ends_at)}
                      </span>
                    )}
                    {item.item_type === 'event' && item.places_left !== null && (
                      <Chip tone={item.places_left > 0 ? 'blue' : 'neutral'}>
                        {item.places_left > 0 ? pluralize(item.places_left, 'place restante', 'places restantes') : 'Complet'}
                      </Chip>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-asphalt-300">Aucune information publiée pour cette journée. Appelez le circuit pour vous renseigner.</p>
            )}
          </div>
        )}
      </div>

      <StatusLegend />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Liste des prochains événements / privatisations publiques
// -----------------------------------------------------------------------------
export function EventList({ items, trackNames }: { items: CalendarItem[]; trackNames: Map<string, string> }) {
  return (
    <ul className="flex flex-col border-y border-asphalt-800">
      {items.map((item) => {
        const key = `${item.item_type}-${item.event_slug ?? item.title}-${item.starts_at ?? item.day}`;
        const tracks = item.track_slugs.map((slug) => trackNames.get(slug)).filter(Boolean).join(', ');
        const full = item.places_left === 0;
        return (
          <li key={key} className="flex flex-col gap-4 border-b border-asphalt-800 py-5 last:border-b-0 sm:flex-row sm:items-center">
            <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-asphalt-900 py-2 ring-1 ring-asphalt-800">
              <span className="font-display text-3xl font-extrabold leading-none tabular">{formatDay(item.day, { day: '2-digit' })}</span>
              <span className="font-display text-sm font-semibold uppercase text-race-400">{formatDay(item.day, { month: 'short' }).replace('.', '')}</span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <p className="font-display text-xl font-bold uppercase leading-tight">{itemLabel(item)}</p>
              <p className="text-sm text-asphalt-400">
                {capitalize(formatDay(item.day))}
                {item.starts_at && item.ends_at && ` · ${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}`}
                {tracks && ` · ${tracks}`}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Chip tone={item.item_type === 'event' ? 'blue' : 'outline'}>
                  {item.item_type === 'event' ? (EVENT_KIND_LABELS[item.status] ?? 'Événement') : (BLOCK_REASON_LABELS[item.status] ?? 'Fermeture')}
                </Chip>
                {item.places_left !== null && (
                  <Chip tone={full ? 'neutral' : 'green'}>{full ? 'Complet' : pluralize(item.places_left, 'place restante', 'places restantes')}</Chip>
                )}
              </div>
            </div>
            {item.item_type === 'event' && item.event_slug && item.places_left !== null && !full && (
              <ButtonLink to={`/reserver/evenement/${item.event_slug}`} size="sm" className="self-start sm:self-center">
                Réserver
              </ButtonLink>
            )}
          </li>
        );
      })}
    </ul>
  );
}
