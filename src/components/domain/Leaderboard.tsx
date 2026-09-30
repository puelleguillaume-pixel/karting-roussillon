import { useState } from 'react';
import { cx } from '@/lib/cx';
import type { LeaderboardGroup } from '@/lib/data/types';
import { formatDay, formatGap, formatLapTime, formatLength } from '@/lib/format';

export function Leaderboard({ groups }: { groups: LeaderboardGroup[] }) {
  const tracks = Array.from(new Map(groups.map((g) => [g.track_slug, g])).values());
  const [active, setActive] = useState(tracks[0]?.track_slug ?? '');
  const visible = groups.filter((g) => g.track_slug === active);

  return (
    <div className="flex flex-col gap-8">
      {tracks.length > 1 && (
        <div role="group" aria-label="Choisir la piste" className="inline-flex self-start bg-asphalt-900 p-1 ring-1 ring-asphalt-800">
          {tracks.map((track) => (
            <button
              key={track.track_slug}
              type="button"
              aria-pressed={track.track_slug === active}
              onClick={() => setActive(track.track_slug)}
              className={cx(
                'px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide transition-colors',
                track.track_slug === active ? 'bg-race-600 text-white' : 'text-asphalt-300 hover:text-chalk',
              )}
            >
              {track.track_name}
              {track.track_length_m ? <span className="ml-1.5 font-medium">{formatLength(track.track_length_m)}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {visible.map((group) => {
          const best = group.records[0]?.lap_time_ms ?? 0;
          return (
            <section key={group.category_label} className="bg-asphalt-900 ring-1 ring-asphalt-800">
              <header className="flex items-baseline justify-between gap-4 border-b border-asphalt-800 px-5 py-4">
                <h3 className="text-display-sm font-bold uppercase">{group.category_label}</h3>
                <span className="text-sm text-asphalt-400">{group.track_name}</span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left tabular">
                  <caption className="sr-only">
                    Meilleurs temps au tour, {group.category_label}, {group.track_name}
                  </caption>
                  <thead className="text-xs uppercase tracking-wider text-asphalt-400">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Pos.</th>
                      <th scope="col" className="py-3 font-semibold">Pilote</th>
                      <th scope="col" className="py-3 text-right font-semibold">Temps</th>
                      <th scope="col" className="hidden py-3 pl-4 text-right font-semibold sm:table-cell">Écart</th>
                      <th scope="col" className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.records.map((record) => (
                      <tr key={`${record.rank}-${record.driver_name}`} className={cx('border-t border-asphalt-800', record.rank === 1 && 'bg-race-600/10')}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2 font-display text-lg font-bold">
                            {record.rank === 1 && <span aria-hidden className="checker size-3 text-chalk [--checker:6px]" />}
                            P{record.rank}
                          </span>
                        </td>
                        <td className="py-3 font-medium">{record.driver_name}</td>
                        <td className={cx('py-3 text-right font-display text-lg font-bold', record.rank === 1 && 'text-race-400')}>
                          {formatLapTime(record.lap_time_ms)}
                        </td>
                        <td className="hidden py-3 pl-4 text-right text-sm text-asphalt-400 sm:table-cell">
                          {record.rank === 1 ? '—' : formatGap(record.lap_time_ms - best)}
                        </td>
                        <td className="hidden px-5 py-3 text-right text-sm text-asphalt-400 sm:table-cell">
                          {formatDay(record.recorded_on, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
