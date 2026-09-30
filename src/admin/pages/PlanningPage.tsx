import { Ban, CalendarPlus, ChevronLeft, ChevronRight, Move, Plus, X } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import { addDays, capitalize, formatDay, formatTime, isoToParisDay, todayInParis } from '@/lib/format';
import { useAdminCatalog, useMoveBooking, usePlanning, usePlanningSummary } from '../api';
import { emptyDraft, type BlockDraft } from '../components/block-draft';
import { BlockDialog } from '../components/BlockDialog';
import { BookingDrawer } from '../components/BookingDrawer';
import { ManualBookingDialog, type ManualBookingDefaults } from '../components/ManualBookingDialog';
import { daysBetween, isoWeekdayOf, monthRange, shiftMonth, startOfWeek } from '../dates';
import { useNow } from '../hooks';
import { BLOCK_REASON, BOOKING_STATUS, parisClock, WEEKDAYS_SHORT } from '../labels';
import { useToast } from '../toast-context';
import type { AdminBlock, AdminTrack, Planning, PlanningBooking, PlanningDay, PlanningSlot } from '../types';
import { AdminPage, Check, ConfirmDialog, Segmented, SmallButton } from '../ui';

type View = 'jour' | 'semaine' | 'mois';

interface MoveTarget {
  booking: PlanningBooking;
  fromSlotId: string;
}

export default function PlanningPage() {
  const [params, setParams] = useSearchParams();
  const today = todayInParis();
  const view = (['jour', 'semaine', 'mois'].includes(params.get('vue') ?? '') ? params.get('vue') : 'jour') as View;
  const day = params.get('jour') ?? today;
  const catalog = useAdminCatalog();
  const tracks = useMemo(() => (catalog.data?.tracks ?? []).filter((t) => t.is_active), [catalog.data]);
  const trackParam = params.get('piste');
  // Semaine : une piste à la fois (lisibilité) ; jour et mois : toutes par défaut
  const selectedTrack = tracks.find((t) => t.id === trackParam) ?? (view === 'semaine' ? tracks.find((t) => t.usage === 'leisure') ?? tracks[0] : undefined);

  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [newBooking, setNewBooking] = useState<ManualBookingDefaults | null>(null);
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);

  const update = (next: Partial<{ vue: View; jour: string; piste: string | null }>) => {
    const merged = { vue: view, jour: day, piste: trackParam, ...next };
    const search: Record<string, string> = { vue: merged.vue, jour: merged.jour };
    if (merged.piste) search.piste = merged.piste;
    setParams(search, { replace: true });
  };

  const step = (delta: number) => {
    if (view === 'jour') update({ jour: addDays(day, delta) });
    else if (view === 'semaine') update({ jour: addDays(day, 7 * delta) });
    else update({ jour: shiftMonth(day, delta) });
  };

  const title =
    view === 'jour'
      ? capitalize(formatDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
      : view === 'semaine'
        ? `Semaine du ${formatDay(startOfWeek(day), { day: 'numeric', month: 'long' })}`
        : capitalize(formatDay(monthRange(day).first, { month: 'long', year: 'numeric' }));

  const quickBlock = (overrides: Partial<BlockDraft>) =>
    setBlockDraft(emptyDraft(overrides.date ?? day, { track_ids: selectedTrack ? [selectedTrack.id] : [], ...overrides }));

  return (
    <AdminPage
      title="Planning"
      description="Réservations par créneau et par piste. Glissez une réservation vers un autre créneau pour la déplacer ; les plages bloquées sont hachurées."
      actions={
        <>
          <SmallButton onClick={() => quickBlock({})}>
            <Ban aria-hidden />
            Bloquer une plage
          </SmallButton>
          <SmallButton variant="primary" onClick={() => setNewBooking({ day })}>
            <Plus aria-hidden />
            Nouvelle réservation
          </SmallButton>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Vue"
          value={view}
          onChange={(v) => update({ vue: v })}
          options={[
            { value: 'jour', label: 'Jour' },
            { value: 'semaine', label: 'Semaine' },
            { value: 'mois', label: 'Mois' },
          ]}
        />
        <div className="flex items-center gap-1">
          <SmallButton variant="ghost" aria-label="Précédent" onClick={() => step(-1)}>
            <ChevronLeft />
          </SmallButton>
          <SmallButton onClick={() => update({ jour: today })}>Aujourd’hui</SmallButton>
          <SmallButton variant="ghost" aria-label="Suivant" onClick={() => step(1)}>
            <ChevronRight />
          </SmallButton>
        </div>
        <input
          type="date"
          aria-label="Aller à la date"
          value={day}
          onChange={(e) => e.target.value && update({ jour: e.target.value })}
          className="h-9 border border-asphalt-600 bg-asphalt-950 px-2 text-sm text-chalk"
        />
        <select
          aria-label="Piste"
          value={selectedTrack?.id ?? ''}
          onChange={(e) => update({ piste: e.target.value || null })}
          className="h-9 border border-asphalt-600 bg-asphalt-950 px-2 text-sm text-chalk"
        >
          {view !== 'semaine' && <option value="">Toutes les pistes (hors baby)</option>}
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name}
            </option>
          ))}
        </select>
        <h2 className="ml-auto font-display text-xl font-bold uppercase">{title}</h2>
      </div>

      {catalog.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : view === 'mois' ? (
        <MonthView
          day={day}
          trackIds={selectedTrack ? [selectedTrack.id] : tracks.filter((t) => t.usage !== 'baby').map((t) => t.id)}
          onOpenDay={(d) => update({ vue: 'jour', jour: d })}
          onQuickBlock={(d, type) => quickBlock({ date: d, block_type: type })}
        />
      ) : (
        <GridView
          view={view}
          day={day}
          tracks={selectedTrack ? [selectedTrack] : tracks.filter((t) => t.usage !== 'baby')}
          onOpenBooking={setOpenBooking}
          onNewBooking={setNewBooking}
          onBlockSlot={(slot, track) =>
            setBlockDraft(
              emptyDraft(isoToParisDay(slot.starts_at), {
                block_type: 'custom',
                start_clock: parisClock(slot.starts_at),
                end_date: isoToParisDay(slot.ends_at),
                end_clock: parisClock(slot.ends_at),
                track_ids: [track.id],
              }),
            )
          }
        />
      )}

      <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <ManualBookingDialog open={!!newBooking} defaults={newBooking ?? { day }} onClose={() => setNewBooking(null)} onCreated={setOpenBooking} />
      <BlockDialog open={!!blockDraft} initial={blockDraft ?? undefined} onClose={() => setBlockDraft(null)} />
    </AdminPage>
  );
}

// -----------------------------------------------------------------------------
// Vues jour / semaine : grille horaires × (pistes ou jours)
// -----------------------------------------------------------------------------
function blockFor(blocks: AdminBlock[], slot: PlanningSlot): AdminBlock | undefined {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  return blocks.find(
    (b) => new Date(b.starts_at).getTime() < end && new Date(b.ends_at).getTime() > start && (b.all_tracks || b.track_ids.includes(slot.track_id)),
  );
}

function GridView({
  view,
  day,
  tracks,
  onOpenBooking,
  onNewBooking,
  onBlockSlot,
}: {
  view: 'jour' | 'semaine';
  day: string;
  tracks: AdminTrack[];
  onOpenBooking: (id: string) => void;
  onNewBooking: (d: ManualBookingDefaults) => void;
  onBlockSlot: (slot: PlanningSlot, track: AdminTrack) => void;
}) {
  const from = view === 'jour' ? day : startOfWeek(day);
  const to = view === 'jour' ? day : addDays(from, 6);
  const planning = usePlanning(from, to, view === 'semaine' ? tracks.map((t) => t.id) : null);
  const toast = useToast();
  const move = useMoveBooking();
  const now = useNow();
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [pendingMove, setPendingMove] = useState<{ target: MoveTarget; slot: PlanningSlot } | null>(null);
  const [notify, setNotify] = useState(true);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const model = useMemo(() => (planning.data ? buildModel(planning.data) : null), [planning.data]);

  if (planning.isError) return <ErrorPanel message={errorMessage(planning.error)} onRetry={() => void planning.refetch()} />;
  if (!model) return <Skeleton className="h-96 w-full" />;

  const columns =
    view === 'jour'
      ? tracks.filter((t) => planning.data!.slots.some((s) => s.track_id === t.id)).map((t) => ({ key: t.id, label: t.short_name, track: t, day }))
      : daysBetween(from, to).map((d) => ({
          key: d,
          label: `${WEEKDAYS_SHORT[isoWeekdayOf(d)]} ${formatDay(d, { day: 'numeric' })}`,
          track: tracks[0]!,
          day: d,
        }));
  const shownTracks = new Set(tracks.map((t) => t.id));
  const clocks = [...new Set(planning.data!.slots.filter((s) => shownTracks.has(s.track_id)).map((s) => parisClock(s.starts_at)))].sort();

  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const requestMove = (target: MoveTarget, slot: PlanningSlot) => {
    setMoving(null);
    if (target.fromSlotId === slot.id) return;
    setPendingMove({ target, slot });
  };

  const confirmMove = () => {
    if (!pendingMove) return;
    const { target, slot } = pendingMove;
    const slotIds = target.booking.sessions.map((s) => (s.slot_id === target.fromSlotId ? slot.id : s.slot_id));
    move.mutate(
      { id: target.booking.id, slotIds, notify },
      {
        onSuccess: () => {
          toast.success(`${target.booking.reference} déplacée à ${formatTime(slot.starts_at)}.`);
          setPendingMove(null);
        },
        onError: (e) => {
          toast.error(e);
          setPendingMove(null);
        },
      },
    );
  };

  if (clocks.length === 0) {
    return <Alert title="Aucun créneau">Pas de créneau sur cette période (fermeture ou horaires non configurés).</Alert>;
  }

  return (
    <div className="flex flex-col gap-3">
      {moving && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-l-4 border-flag-blue bg-flag-blue/10 px-4 py-2 text-sm">
          <Move aria-hidden className="size-4 text-flag-blue" />
          <span className="flex-1">
            Déplacement de <strong>{moving.booking.reference}</strong> ({moving.booking.customer}) : choisissez le nouveau créneau.
          </span>
          <SmallButton variant="ghost" onClick={() => setMoving(null)}>
            <X aria-hidden />
            Annuler
          </SmallButton>
        </div>
      )}
      <Legend />
      <div className="overflow-x-auto ring-1 ring-asphalt-800" onKeyDown={(e) => e.key === 'Escape' && setMoving(null)}>
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${4 + columns.length * 13}rem` }}>
          <caption className="sr-only">Planning {view === 'jour' ? 'du jour' : 'de la semaine'}</caption>
          <thead className="sticky top-0 z-10 bg-asphalt-900">
            <tr>
              <th scope="col" className="w-16 border-b border-asphalt-700 px-2 py-2 text-left text-xs text-asphalt-400">
                Heure
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="border-b border-l border-asphalt-700 px-2 py-2 text-left font-display text-base font-bold uppercase">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clocks.map((clock) => (
              <tr key={clock} className="align-top">
                <th scope="row" className="border-b border-asphalt-800 px-2 py-1.5 text-left font-semibold tabular text-asphalt-300">
                  {clock.replace(':', 'h')}
                </th>
                {columns.map((c) => {
                  const trackId = view === 'jour' ? c.track.id : tracks[0]!.id;
                  const slot = model.slotsByKey.get(`${view === 'jour' ? day : c.day}|${clock}|${trackId}`);
                  if (!slot) return <td key={c.key} className="border-b border-l border-asphalt-800 bg-asphalt-950" />;
                  const track = trackById.get(slot.track_id)!;
                  return (
                    <SlotCell
                      key={c.key}
                      slot={slot}
                      block={blockFor(planning.data!.blocks, slot)}
                      bookings={model.bookingsBySlot.get(slot.id) ?? []}
                      past={new Date(slot.ends_at).getTime() < now}
                      moving={moving}
                      dragOver={dragOver === slot.id}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes('application/x-kr-booking')) return;
                        e.preventDefault();
                        setDragOver(slot.id);
                      }}
                      onDragLeave={() => setDragOver((current) => (current === slot.id ? null : current))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const raw = e.dataTransfer.getData('application/x-kr-booking');
                        const [bookingId, fromSlotId] = raw.split('|');
                        const booking = planning.data!.bookings.find((b) => b.id === bookingId);
                        if (booking && fromSlotId) requestMove({ booking, fromSlotId }, slot);
                      }}
                      onPlaceHere={() => moving && requestMove(moving, slot)}
                      onStartMove={(booking) => setMoving({ booking, fromSlotId: slot.id })}
                      onOpenBooking={onOpenBooking}
                      onNewBooking={() => onNewBooking({ day: isoToParisDay(slot.starts_at), slotId: slot.id })}
                      onBlock={() => onBlockSlot(slot, track)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!pendingMove}
        title="Déplacer la réservation ?"
        confirmLabel="Déplacer"
        busy={move.isPending}
        onClose={() => setPendingMove(null)}
        onConfirm={confirmMove}
      >
        {pendingMove && (
          <>
            <p>
              <strong>{pendingMove.target.booking.reference}</strong> · {pendingMove.target.booking.customer} · {pendingMove.target.booking.karts} kart(s)
            </p>
            <p>
              Nouveau créneau : {capitalize(formatDay(isoToParisDay(pendingMove.slot.starts_at)))} à {formatTime(pendingMove.slot.starts_at)} ·{' '}
              {trackById.get(pendingMove.slot.track_id)?.short_name}
            </p>
            <Check label="Prévenir le client par email (nouvel horaire)" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function buildModel(data: Planning) {
  const slotsByKey = new Map<string, PlanningSlot>();
  for (const slot of data.slots) slotsByKey.set(`${isoToParisDay(slot.starts_at)}|${parisClock(slot.starts_at)}|${slot.track_id}`, slot);
  const bookingsBySlot = new Map<string, PlanningBooking[]>();
  for (const booking of data.bookings) {
    for (const session of booking.sessions) {
      const list = bookingsBySlot.get(session.slot_id) ?? [];
      list.push(booking);
      bookingsBySlot.set(session.slot_id, list);
    }
  }
  return { slotsByKey, bookingsBySlot };
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-asphalt-400" aria-label="Légende">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 bg-asphalt-800 ring-1 ring-asphalt-600" /> Réservation
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 bg-flag-green/30 ring-1 ring-flag-green/50" /> Arrivée enregistrée
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 [background:repeating-linear-gradient(-45deg,rgb(208_0_16/0.35)_0_4px,transparent_4px_8px)]" /> Plage bloquée
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 bg-asphalt-950 ring-1 ring-asphalt-700 opacity-50" /> Créneau passé ou fermé
      </li>
    </ul>
  );
}

function SlotCell({
  slot,
  block,
  bookings,
  past,
  moving,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPlaceHere,
  onStartMove,
  onOpenBooking,
  onNewBooking,
  onBlock,
}: {
  slot: PlanningSlot;
  block: AdminBlock | undefined;
  bookings: PlanningBooking[];
  past: boolean;
  moving: MoveTarget | null;
  dragOver: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onPlaceHere: () => void;
  onStartMove: (b: PlanningBooking) => void;
  onOpenBooking: (id: string) => void;
  onNewBooking: () => void;
  onBlock: () => void;
}) {
  const capacity = slot.capacities.reduce((sum, c) => sum + c.capacity, 0);
  const booked = slot.capacities.reduce((sum, c) => sum + c.booked, 0);
  const held = slot.capacities.reduce((sum, c) => sum + c.held, 0);
  const full = capacity > 0 && booked >= capacity;
  const closed = !slot.is_active;
  const canTarget = !past && !closed && !block;
  const acceptsMoving =
    !!moving && canTarget && !moving.booking.sessions.some((s) => s.slot_id === slot.id) && slot.capacities.some((c) => c.vehicle_type_id === moving.booking.vehicle_type_id);

  return (
    <td
      onDragOver={canTarget ? onDragOver : undefined}
      onDragLeave={onDragLeave}
      onDrop={canTarget ? onDrop : undefined}
      className={cx(
        'group relative h-14 border-b border-l border-asphalt-800 px-1.5 py-1 transition-colors',
        (past || closed) && 'bg-asphalt-950',
        block && '[background:repeating-linear-gradient(-45deg,rgb(208_0_16/0.22)_0_6px,transparent_6px_12px)]',
        dragOver && 'bg-flag-blue/20 ring-2 ring-inset ring-flag-blue',
      )}
    >
      <div className="flex items-center justify-between gap-1 text-[0.7rem] text-asphalt-400">
        <span
          className={cx('tabular', full && 'font-semibold text-race-400')}
          title={slot.capacities.map((c) => `${c.booked}/${c.capacity}`).join(' · ')}
        >
          {booked}/{capacity}
          {held > 0 && <span className="text-flag-yellow"> +{held}</span>}
        </span>
        {block && (
          <span className="truncate font-semibold text-race-400" title={block.internal_note || undefined}>
            {block.public_label || BLOCK_REASON[block.reason]}
          </span>
        )}
        {closed && !block && <span>fermé</span>}
      </div>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {bookings.map((b) => (
          <li key={b.id} className="flex items-stretch">
            <button
              type="button"
              draggable={!past}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-kr-booking', `${b.id}|${slot.id}`);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onOpenBooking(b.id)}
              className={cx(
                'min-w-0 flex-1 truncate px-1.5 py-0.5 text-left text-xs ring-1',
                b.status === 'checked_in' ? 'bg-flag-green/20 ring-flag-green/50' : b.status === 'reschedule_required' ? 'bg-flag-yellow/15 ring-flag-yellow/50' : 'bg-asphalt-800 ring-asphalt-600 hover:ring-race-400',
                !past && 'cursor-grab active:cursor-grabbing',
              )}
              title={`${b.reference} · ${b.customer} · ${b.product ?? ''} · ${BOOKING_STATUS[b.status].label}`}
            >
              <span className="font-semibold text-chalk">{b.karts}×</span> {b.customer}
            </button>
            {!past && (
              <button
                type="button"
                onClick={() => onStartMove(b)}
                aria-label={`Déplacer ${b.reference} (${b.customer})`}
                className="flex w-6 shrink-0 items-center justify-center bg-asphalt-850 text-asphalt-400 ring-1 ring-asphalt-600 hover:text-chalk"
              >
                <Move aria-hidden className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {acceptsMoving && (
        <button type="button" onClick={onPlaceHere} className="mt-1 w-full bg-flag-blue/20 py-0.5 text-xs font-semibold text-flag-blue ring-1 ring-flag-blue/50 hover:bg-flag-blue/30">
          Déplacer ici
        </button>
      )}
      {!moving && !past && !closed && (
        <div className="mt-0.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {!block && (
            <button type="button" onClick={onNewBooking} aria-label={`Réserver à ${formatTime(slot.starts_at)}`} className="flex h-6 flex-1 items-center justify-center bg-asphalt-850 text-asphalt-300 ring-1 ring-asphalt-700 hover:text-chalk">
              <CalendarPlus aria-hidden className="size-3.5" />
            </button>
          )}
          {!block && (
            <button type="button" onClick={onBlock} aria-label={`Bloquer le créneau de ${formatTime(slot.starts_at)}`} className="flex h-6 flex-1 items-center justify-center bg-asphalt-850 text-asphalt-300 ring-1 ring-asphalt-700 hover:text-race-400">
              <Ban aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </td>
  );
}

// -----------------------------------------------------------------------------
// Vue mois : remplissage, blocages et événements ; blocage en un clic
// -----------------------------------------------------------------------------
function MonthView({
  day,
  trackIds,
  onOpenDay,
  onQuickBlock,
}: {
  day: string;
  trackIds: string[];
  onOpenDay: (day: string) => void;
  onQuickBlock: (day: string, type: 'full_day' | 'morning' | 'afternoon') => void;
}) {
  const { first, last } = monthRange(day);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const summary = usePlanningSummary(gridStart, gridEnd, trackIds);
  const today = todayInParis();

  if (summary.isError) return <ErrorPanel message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />;
  if (!summary.data) return <Skeleton className="h-96 w-full" />;
  const byDay = new Map(summary.data.map((d) => [d.day, d]));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[48rem] grid-cols-7 gap-px bg-asphalt-800 ring-1 ring-asphalt-800">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <div key={n} className="bg-asphalt-900 px-2 py-1.5 text-xs font-semibold uppercase text-asphalt-400">
            {WEEKDAYS_SHORT[n]}
          </div>
        ))}
        {daysBetween(gridStart, gridEnd).map((d) => (
          <MonthCell key={d} day={d} info={byDay.get(d)} outside={d < first || d > last} isToday={d === today} past={d < today} onOpen={() => onOpenDay(d)} onQuickBlock={(t) => onQuickBlock(d, t)} />
        ))}
      </div>
      <p className="mt-2 text-xs text-asphalt-400">Survolez un jour (ou tabulez jusqu’à lui) pour le bloquer en un clic : journée, matin ou après-midi.</p>
    </div>
  );
}

function MonthCell({
  day,
  info,
  outside,
  isToday,
  past,
  onOpen,
  onQuickBlock,
}: {
  day: string;
  info: PlanningDay | undefined;
  outside: boolean;
  isToday: boolean;
  past: boolean;
  onOpen: () => void;
  onQuickBlock: (type: 'full_day' | 'morning' | 'afternoon') => void;
}) {
  const pct = info && info.capacity > 0 ? Math.round((info.booked / info.capacity) * 100) : 0;
  return (
    <div className={cx('group flex min-h-32 flex-col gap-1 bg-asphalt-900 p-2', outside && 'bg-asphalt-950 text-asphalt-400', !!info?.blocks.length && 'bg-race-600/10')}>
      <button
        type="button"
        onClick={onOpen}
        className={cx('self-start font-display text-lg font-bold leading-none hover:text-race-400', isToday && 'bg-race-600 px-1.5 text-white')}
        aria-label={`Ouvrir le ${formatDay(day)}`}
      >
        {Number(day.slice(8))}
      </button>
      {info && info.capacity > 0 && (
        <div className="flex flex-col gap-0.5">
          <span aria-hidden className="h-1 w-full bg-asphalt-700">
            <span className={cx('block h-full', pct >= 80 ? 'bg-race-500' : pct >= 40 ? 'bg-flag-yellow' : 'bg-flag-green')} style={{ width: `${Math.min(pct, 100)}%` }} />
          </span>
          <span className="text-[0.7rem] text-asphalt-400">
            {info.bookings_count} rés. · {pct} %
          </span>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-[0.7rem] leading-tight">
        {info?.blocks.map((b) => (
          <li key={b.id} className="truncate bg-race-600/25 px-1 py-0.5 text-chalk" title={b.public_label ?? BLOCK_REASON[b.reason]}>
            {b.block_type === 'morning' ? 'Matin · ' : b.block_type === 'afternoon' ? 'A.-midi · ' : b.block_type === 'custom' ? `${formatTime(b.starts_at)} · ` : ''}
            {b.public_label || BLOCK_REASON[b.reason]}
          </li>
        ))}
        {info?.events.map((e) => (
          <li key={e.id} className="truncate bg-flag-blue/20 px-1 py-0.5 text-chalk" title={e.title}>
            {e.title} ({e.booked}/{e.capacity})
          </li>
        ))}
      </ul>
      {!past && !outside && (
        <div className="mt-auto flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {(
            [
              ['full_day', 'Jour', 'Bloquer la journée'],
              ['morning', 'Mat.', 'Bloquer le matin'],
              ['afternoon', 'A.-m.', 'Bloquer l’après-midi'],
            ] as const
          ).map(([type, short, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => onQuickBlock(type)}
              aria-label={`${label} du ${formatDay(day)}`}
              className="flex-1 bg-asphalt-800 py-0.5 text-[0.7rem] font-semibold text-asphalt-200 ring-1 ring-asphalt-600 hover:bg-race-600 hover:text-white"
            >
              {short}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
