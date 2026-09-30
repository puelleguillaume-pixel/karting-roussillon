import { AlertTriangle, ArrowRight, Ban, ChevronLeft, ChevronRight, Flag, Inbox, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { contactContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import { addDays, capitalize, formatDay, formatPrice, formatTime, isoToParisDay, todayInParis } from '@/lib/format';
import { useSiteBundle } from '@/lib/queries';
import { useDashboard } from '../api';
import { useNow } from '../hooks';
import { BookingDrawer } from '../components/BookingDrawer';
import { Weather } from '../components/Weather';
import { BLOCK_REASON, BOOKING_STATUS, formatDateTime, formatShortDate } from '../labels';
import { useStaffMember } from '../role-context';
import type { Dashboard, Revenue } from '../types';
import { AdminPage, Panel, SmallButton, Stat } from '../ui';

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const today = todayInParis();
  const day = params.get('jour') ?? today;
  const dashboard = useDashboard(day);
  const { display_name } = useStaffMember();
  const bundle = useSiteBundle().data;
  const geo = bundle ? contactContent(bundle)?.data.geo : undefined;
  const [openBooking, setOpenBooking] = useState<string | null>(null);

  const setDay = (next: string) => setParams(next === today ? {} : { jour: next }, { replace: true });

  return (
    <AdminPage
      title="Tableau de bord"
      description={`Bonjour ${display_name}. ${capitalize(formatDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${day === today ? ' (aujourd’hui)' : ''}.`}
      actions={
        <div className="flex items-center gap-1">
          <SmallButton variant="ghost" aria-label="Jour précédent" onClick={() => setDay(addDays(day, -1))}>
            <ChevronLeft />
          </SmallButton>
          <SmallButton onClick={() => setDay(today)} disabled={day === today}>
            Aujourd’hui
          </SmallButton>
          <SmallButton variant="ghost" aria-label="Jour suivant" onClick={() => setDay(addDays(day, 1))}>
            <ChevronRight />
          </SmallButton>
        </div>
      }
    >
      {dashboard.isError ? (
        <ErrorPanel message={errorMessage(dashboard.error)} onRetry={() => void dashboard.refetch()} />
      ) : !dashboard.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <DashboardContent data={dashboard.data} day={day} geo={geo} onOpenBooking={setOpenBooking} />
      )}
      <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
    </AdminPage>
  );
}

function DashboardContent({
  data,
  day,
  geo,
  onOpenBooking,
}: {
  data: Dashboard;
  day: string;
  geo: { lat: number; lng: number } | undefined;
  onOpenBooking: (id: string) => void;
}) {
  const now = useNow();
  const alerts = [
    data.pending_requests > 0 && {
      to: '/admin/demandes',
      icon: Inbox,
      text: `${data.pending_requests} demande${data.pending_requests > 1 ? 's' : ''} à traiter`,
    },
    data.reschedule_required > 0 && {
      to: '/admin/reservations?statut=reschedule_required',
      icon: RotateCcw,
      text: `${data.reschedule_required} réservation${data.reschedule_required > 1 ? 's' : ''} en attente de report par le client`,
    },
    data.refunds_due > 0 && {
      to: '/admin/reservations?remboursement=1',
      icon: AlertTriangle,
      text: `${data.refunds_due} remboursement${data.refunds_due > 1 ? 's' : ''} à effectuer`,
    },
  ].filter(Boolean) as Array<{ to: string; icon: typeof Inbox; text: string }>;

  // Créneaux du jour regroupés par heure
  const byTime = new Map<string, Dashboard['slots']>();
  for (const slot of data.slots) {
    const list = byTime.get(slot.starts_at) ?? [];
    list.push(slot);
    byTime.set(slot.starts_at, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Réservations" value={data.bookings_count} hint={`${data.participants_count} participant(s)`} />
        <Stat
          label="Arrivées"
          value={`${data.checked_in_count} / ${data.bookings_count}`}
          hint="Groupes enregistrés au check-in"
          tone={data.bookings_count > 0 && data.checked_in_count === data.bookings_count ? 'green' : undefined}
        />
        <Stat label="Remplissage" value={`${data.fill_rate.toLocaleString('fr-FR')} %`} hint="Karts réservés / capacité des créneaux ouverts" />
        <div className="col-span-2 xl:col-span-1">
          <Weather day={day} geo={geo} />
        </div>
      </div>

      {data.revenue && <RevenuePanel revenue={data.revenue} />}

      {alerts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <li key={alert.to}>
              <Link
                to={alert.to}
                className="flex items-center gap-3 border-l-4 border-race-500 bg-race-600/10 px-4 py-3 text-sm font-semibold text-chalk hover:bg-race-600/20"
              >
                <alert.icon aria-hidden className="size-5 text-race-400" />
                <span className="flex-1">{alert.text}</span>
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Réservations par créneau"
          actions={
            <Link to={`/admin/planning?jour=${day}&vue=jour`} className="text-sm text-asphalt-300 hover:text-chalk">
              Ouvrir le planning →
            </Link>
          }
          padded={false}
        >
          {byTime.size === 0 ? (
            <p className="p-4 text-sm text-asphalt-400">Aucune réservation sur les créneaux de cette journée.</p>
          ) : (
            <ol className="divide-y divide-asphalt-800">
              {[...byTime.entries()].map(([startsAt, slots]) => (
                <li key={startsAt} className="grid gap-2 px-4 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <p
                    className={cx(
                      'font-display text-xl font-bold tabular',
                      new Date(startsAt).getTime() < now - 15 * 60_000 && isoToParisDay(startsAt) === todayInParis() && 'text-asphalt-400',
                    )}
                  >
                    {formatTime(startsAt)}
                  </p>
                  <div className="flex flex-col gap-2">
                    {slots.map((slot) => (
                      <div key={slot.slot_id} className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-3 text-xs text-asphalt-400">
                          <span className="font-semibold text-asphalt-200">{slot.track}</span>
                          <FillBar booked={slot.booked} capacity={slot.capacity} />
                          <span className="tabular">
                            {slot.booked}/{slot.capacity} karts
                          </span>
                          {slot.blocked && <Chip tone="red">Bloqué</Chip>}
                        </div>
                        <ul className="flex flex-wrap gap-1.5">
                          {slot.bookings.map((b) => (
                            <li key={b.id}>
                              <button
                                type="button"
                                onClick={() => onOpenBooking(b.id)}
                                className={cx(
                                  'flex items-center gap-2 px-2.5 py-1.5 text-left text-sm ring-1 transition-colors',
                                  b.status === 'checked_in'
                                    ? 'bg-flag-green/10 ring-flag-green/40 hover:bg-flag-green/20'
                                    : 'bg-asphalt-800 ring-asphalt-600 hover:ring-race-400',
                                )}
                              >
                                <span className="font-semibold text-chalk">{b.customer}</span>
                                <span className="text-xs text-asphalt-400">
                                  {b.karts} kart{b.karts > 1 ? 's' : ''} · {BOOKING_STATUS[b.status].label}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel
            title="Blocages à venir"
            actions={
              <Link to="/admin/blocages" className="text-sm text-asphalt-300 hover:text-chalk">
                Gérer →
              </Link>
            }
          >
            {data.upcoming_blocks.length === 0 ? (
              <p className="text-sm text-asphalt-400">Aucun blocage dans les 14 prochains jours.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.upcoming_blocks.map((b) => (
                  <li key={b.id} className="flex items-start gap-2">
                    <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-race-400" />
                    <span>
                      <span className="font-semibold">{b.public_label || BLOCK_REASON[b.reason]}</span>
                      <span className="block text-xs text-asphalt-400">
                        {formatDateTime(b.starts_at)} → {formatTime(b.ends_at)}
                        {b.all_tracks ? ' · tout le site' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="Événements (30 jours)"
            actions={
              <Link to="/admin/evenements" className="text-sm text-asphalt-300 hover:text-chalk">
                Voir →
              </Link>
            }
          >
            {data.upcoming_events.length === 0 ? (
              <p className="text-sm text-asphalt-400">Aucun événement programmé.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.upcoming_events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <Flag aria-hidden className="mt-0.5 size-4 shrink-0 text-flag-blue" />
                    <span>
                      <span className="font-semibold">{e.title}</span>
                      <span className="block text-xs text-asphalt-400">
                        {formatShortDate(e.starts_at)} · {e.capacity} places
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function FillBar({ booked, capacity }: { booked: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  return (
    <span aria-hidden className="h-1.5 w-24 bg-asphalt-700">
      <span className={cx('block h-full', pct >= 90 ? 'bg-race-500' : pct >= 60 ? 'bg-flag-yellow' : 'bg-flag-green')} style={{ width: `${pct}%` }} />
    </span>
  );
}

function RevenuePanel({ revenue }: { revenue: NonNullable<Dashboard['revenue']> }) {
  const periods: Array<[string, Revenue]> = [
    ['Jour', revenue.day],
    ['Semaine', revenue.week],
    ['Mois', revenue.month],
  ];
  return (
    <Panel
      title="Chiffre d’affaires TTC"
      actions={
        <Link to="/admin/exports" className="text-sm text-asphalt-300 hover:text-chalk">
          Exports comptables →
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {periods.map(([label, r]) => (
          <div key={label} className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-asphalt-400">{label}</p>
            <p className="font-display text-3xl font-extrabold tabular">{formatPrice(r.collected_cents + r.gift_cards_redeemed_cents)}</p>
            <p className="text-xs text-asphalt-400">
              Encaissé {formatPrice(r.collected_cents)} · bons consommés {formatPrice(r.gift_cards_redeemed_cents)}
            </p>
            <p className="text-xs text-asphalt-400">Bons vendus (produits constatés d’avance) : {formatPrice(r.gift_cards_sold_cents)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
