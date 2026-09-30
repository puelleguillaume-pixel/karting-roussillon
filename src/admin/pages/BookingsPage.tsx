import { Download, Plus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel } from '@/components/ui/feedback';
import { rpc } from '@/lib/data/source';
import { errorMessage } from '@/lib/data/errors';
import { addDays, formatPrice, todayInParis } from '@/lib/format';
import { useBookings } from '../api';
import { BookingDrawer } from '../components/BookingDrawer';
import { ManualBookingDialog } from '../components/ManualBookingDialog';
import { downloadCsv, euros } from '../files';
import { BOOKING_SOURCE, BOOKING_STATUS, CANCELLATION_RESULT, formatDateTime } from '../labels';
import { useToast } from '../toast-context';
import type { BookingRow, Paged } from '../types';
import { AdminPage, DataTable, Pagination, Panel, SearchInput, Select, SmallButton, StatusChip, type Column } from '../ui';

const LIMIT = 50;

const STATUS_FILTERS: Record<string, { label: string; status?: string[]; outcome?: string }> = {
  actives: { label: 'Actives', status: ['pending', 'confirmed', 'checked_in', 'reschedule_required'] },
  reschedule_required: { label: 'À reporter par le client', status: ['reschedule_required'] },
  checked_in: { label: 'Arrivées', status: ['checked_in', 'completed'] },
  cancelled: { label: 'Annulées', status: ['cancelled'] },
  refund_due: { label: 'Remboursements à effectuer', status: ['cancelled'], outcome: 'refund_due' },
  no_show: { label: 'Absents', status: ['no_show'] },
  toutes: { label: 'Toutes' },
};

const PERIODS: Record<string, { label: string; range: () => { from?: string; to?: string; order: 'asc' | 'desc' } }> = {
  avenir: { label: 'À venir', range: () => ({ from: todayInParis(), order: 'asc' }) },
  aujourdhui: { label: 'Aujourd’hui', range: () => ({ from: todayInParis(), to: todayInParis(), order: 'asc' }) },
  semaine: { label: '7 prochains jours', range: () => ({ from: todayInParis(), to: addDays(todayInParis(), 6), order: 'asc' }) },
  passees: { label: 'Passées', range: () => ({ to: addDays(todayInParis(), -1), order: 'desc' }) },
  toutes: { label: 'Toutes les dates', range: () => ({ order: 'desc' }) },
};

export default function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const statusKey = params.get('remboursement') ? 'refund_due' : (params.get('statut') ?? 'actives');
  const status = STATUS_FILTERS[statusKey] ?? (BOOKING_STATUS[statusKey as keyof typeof BOOKING_STATUS] ? { label: '', status: [statusKey] } : STATUS_FILTERS.actives!);
  const periodKey = params.get('periode') ?? (statusKey === 'refund_due' || statusKey === 'cancelled' ? 'toutes' : 'avenir');
  const period = (PERIODS[periodKey] ?? PERIODS.avenir!).range();
  const [q, setQ] = useState(params.get('q') ?? '');
  const deferredQ = useDeferredValue(q.trim());
  const [offset, setOffset] = useState(0);
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters = {
    q: deferredQ || undefined,
    status: status.status,
    outcome: status.outcome,
    from: deferredQ ? undefined : period.from,
    to: deferredQ ? undefined : period.to,
    order: deferredQ ? 'desc' : period.order,
  };
  const bookings = useBookings({ ...filters, limit: LIMIT, offset });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete('remboursement');
    next.set(key, value);
    setParams(next, { replace: true });
    setOffset(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: BookingRow[] = [];
      for (let start = 0; ; start += 200) {
        const page = await rpc<Paged<BookingRow>>('admin_list_bookings', { p: { ...filters, limit: 200, offset: start } });
        rows.push(...page.rows);
        if (rows.length >= page.total || page.rows.length === 0) break;
      }
      downloadCsv(`reservations-${todayInParis()}.csv`, rows, [
        { header: 'Référence', value: (r) => r.reference },
        { header: 'Date', value: (r) => formatDateTime(r.starts_at) },
        { header: 'Statut', value: (r) => BOOKING_STATUS[r.status].label },
        { header: 'Origine', value: (r) => BOOKING_SOURCE[r.source] },
        { header: 'Activité', value: (r) => r.product ?? r.event },
        { header: 'Pistes', value: (r) => r.tracks.join(', ') },
        { header: 'Karts', value: (r) => r.karts },
        { header: 'Participants', value: (r) => r.participants_count },
        { header: 'Client', value: (r) => r.customer.name },
        { header: 'Téléphone', value: (r) => r.customer.phone },
        { header: 'Email', value: (r) => r.customer.email },
        { header: 'Total TTC (€)', value: (r) => euros(r.total_cents) },
        { header: 'Bon cadeau (€)', value: (r) => euros(r.gift_card_applied_cents) },
        { header: 'Encaissé (€)', value: (r) => euros(r.paid_cents) },
        { header: 'Reste dû (€)', value: (r) => euros(r.amount_due_cents) },
      ]);
    } catch (error) {
      toast.error(error);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<BookingRow>[] = [
    {
      key: 'ref',
      header: 'Réservation',
      cell: (r) => (
        <span className="flex flex-col">
          <span>{formatDateTime(r.starts_at)}</span>
          <span className="text-xs font-normal text-asphalt-400">{r.reference}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Client',
      cell: (r) => (
        <span className="flex flex-col">
          <span className="text-chalk">{r.customer.name}</span>
          <span className="text-xs text-asphalt-400">{r.customer.phone || r.customer.email}</span>
        </span>
      ),
    },
    {
      key: 'activity',
      header: 'Activité',
      cell: (r) => (
        <span className="flex flex-col">
          <span>{r.product ?? r.event}</span>
          <span className="text-xs text-asphalt-400">
            {r.product ? `${r.karts} kart(s) · ` : ''}
            {r.participants_count} pers. {r.tracks.length ? `· ${r.tracks.join(', ')}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          <StatusChip status={BOOKING_STATUS[r.status]} />
          {r.cancellation_outcome && <Chip tone={r.cancellation_outcome === 'refund_due' ? 'red' : 'outline'}>{CANCELLATION_RESULT[r.cancellation_outcome]}</Chip>}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      className: 'text-right',
      cell: (r) => (
        <span className="flex flex-col items-end tabular">
          <span>{formatPrice(r.total_cents)}</span>
          {r.status !== 'cancelled' && r.amount_due_cents > 0 && <span className="text-xs text-flag-yellow">reste {formatPrice(r.amount_due_cents)}</span>}
          {r.status !== 'cancelled' && r.amount_due_cents === 0 && r.total_cents > 0 && <span className="text-xs text-flag-green">réglée</span>}
        </span>
      ),
    },
    { key: 'source', header: 'Origine', cell: (r) => <span className="text-asphalt-300">{BOOKING_SOURCE[r.source]}</span> },
  ];

  return (
    <AdminPage
      title="Réservations"
      description="Toutes les réservations (en ligne, téléphone, comptoir, trackdays). Cliquez sur une ligne pour ouvrir la fiche."
      actions={
        <>
          <SmallButton onClick={() => void exportCsv()} busy={exporting}>
            <Download aria-hidden />
            Export CSV
          </SmallButton>
          <SmallButton variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Nouvelle réservation
          </SmallButton>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
          placeholder="Référence, nom, téléphone, email…"
        />
        <Select label="Statut" value={statusKey} onChange={(e) => setFilter('statut', e.target.value)} className="w-56">
          {Object.entries(STATUS_FILTERS).map(([key, f]) => (
            <option key={key} value={key}>
              {f.label}
            </option>
          ))}
        </Select>
        <Select label="Période" value={periodKey} onChange={(e) => setFilter('periode', e.target.value)} className="w-48" disabled={!!deferredQ}>
          {Object.entries(PERIODS).map(([key, f]) => (
            <option key={key} value={key}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      {deferredQ && <p className="-mt-3 text-xs text-asphalt-400">Recherche sur toutes les dates.</p>}

      <Panel padded={false}>
        {bookings.isError ? (
          <div className="p-4">
            <ErrorPanel message={errorMessage(bookings.error)} onRetry={() => void bookings.refetch()} />
          </div>
        ) : (
          <>
            <DataTable
              caption="Réservations"
              rows={bookings.data?.rows}
              columns={columns}
              rowKey={(r) => r.id}
              onRowClick={(r) => setOpenBooking(r.id)}
              loading={bookings.isPending}
              empty="Aucune réservation pour ces critères."
            />
            {bookings.data && <Pagination total={bookings.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
          </>
        )}
      </Panel>

      <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <ManualBookingDialog open={creating} defaults={{ day: todayInParis() }} onClose={() => setCreating(false)} onCreated={setOpenBooking} />
    </AdminPage>
  );
}
