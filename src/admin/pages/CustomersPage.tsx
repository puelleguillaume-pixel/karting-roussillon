import { Download, Plus, Save, ShieldCheck, UserX } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/data/errors';
import { formatLapTime, formatPrice, todayInParis } from '@/lib/format';
import { exportCustomer, useAnonymizeCustomer, useChronoValidation, useCreateCustomer, useCustomer, useCustomers, useUpdateCustomer } from '../api';
import { BookingDrawer } from '../components/BookingDrawer';
import { downloadText } from '../files';
import { BOOKING_STATUS, formatDateTime, GIFT_STATUS, REQUEST_STATUS, REQUEST_TYPE } from '../labels';
import { useStaffMember } from '../role-context';
import { useToast } from '../toast-context';
import type { AdminCustomer, CustomerRow } from '../types';
import { AdminPage, Check, ConfirmDialog, DataTable, Input, Modal, Pagination, Panel, SearchInput, SmallButton, StatusChip, Textarea, type Column } from '../ui';

const LIMIT = 50;

export default function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const [offset, setOffset] = useState(0);
  const customers = useCustomers({ q: deferred || undefined, limit: LIMIT, offset });
  const openId = params.get('fiche');
  const [creating, setCreating] = useState(false);
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('fiche', id);
    else next.delete('fiche');
    setParams(next, { replace: true });
  };

  const columns: Column<CustomerRow>[] = [
    {
      key: 'name',
      header: 'Client',
      cell: (c) => (
        <span className="flex flex-col">
          <span>
            {c.first_name} {c.last_name}
          </span>
          {c.company && <span className="text-xs font-normal text-asphalt-400">{c.company}</span>}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (c) => (
        <span className="flex flex-col text-asphalt-300">
          <span>{c.phone}</span>
          <span className="text-xs">{c.email}</span>
        </span>
      ),
    },
    { key: 'bookings', header: 'Réservations', cell: (c) => <span className="tabular">{c.bookings_count}</span> },
    { key: 'last', header: 'Dernière venue', cell: (c) => <span className="text-asphalt-300">{c.last_booking_at ? formatDateTime(c.last_booking_at) : '—'}</span> },
    {
      key: 'flags',
      header: '',
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.chrono_validated && <Chip tone="green">Chrono validé</Chip>}
          {c.has_account && <Chip tone="outline">Compte</Chip>}
          {c.anonymized && <Chip tone="neutral">Anonymisé</Chip>}
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Clients"
      description="Fiches clients, historique et notes internes. Export et anonymisation sur demande (RGPD)."
      actions={
        <SmallButton variant="primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          Nouveau client
        </SmallButton>
      }
    >
      <SearchInput
        value={q}
        onChange={(v) => {
          setQ(v);
          setOffset(0);
        }}
        placeholder="Nom, téléphone, email, entreprise…"
      />
      <Panel padded={false}>
        {customers.isError ? (
          <div className="p-4">
            <ErrorPanel message={errorMessage(customers.error)} onRetry={() => void customers.refetch()} />
          </div>
        ) : (
          <>
            <DataTable caption="Clients" rows={customers.data?.rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setOpen(c.id)} loading={customers.isPending} empty="Aucun client." />
            {customers.data && <Pagination total={customers.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
          </>
        )}
      </Panel>
      <Modal open={!!openId} onClose={() => setOpen(null)} side title="Fiche client">
        {openId && <CustomerDetails id={openId} onDeleted={() => setOpen(null)} />}
      </Modal>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nouveau client">
        {creating && (
          <CreateCustomer
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              setOpen(id);
            }}
          />
        )}
      </Modal>
    </AdminPage>
  );
}

function CreateCustomer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const create = useCreateCustomer();
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', company: '' });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(form, { onSuccess: (id) => (toast.success('Client créé.'), onCreated(id)), onError: toast.error });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Prénom" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
        <Input label="Nom" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} required />
        <Input label="Téléphone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Entreprise" value={form.company} onChange={(e) => set('company', e.target.value)} className="sm:col-span-2" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={create.isPending}>
          Créer
        </SmallButton>
      </div>
    </form>
  );
}

function CustomerDetails({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const customer = useCustomer(id);
  if (customer.isPending) return <Skeleton className="h-64" />;
  if (customer.isError) return <ErrorPanel message={errorMessage(customer.error)} />;
  return <CustomerView key={customer.data.id} c={customer.data} onDeleted={onDeleted} />;
}

function CustomerView({ c, onDeleted }: { c: AdminCustomer; onDeleted: () => void }) {
  const { isOwner } = useStaffMember();
  const toast = useToast();
  const update = useUpdateCustomer();
  const chrono = useChronoValidation();
  const anonymize = useAnonymizeCustomer();
  const [form, setForm] = useState({
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email ?? '',
    phone: c.phone,
    company: c.company,
    birth_date: c.birth_date ?? '',
    internal_notes: c.internal_notes,
    marketing_opt_in: c.marketing_opt_in,
  });
  const [openBooking, setOpenBooking] = useState<string | null>(null);
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify({ first_name: c.first_name, last_name: c.last_name, email: c.email ?? '', phone: c.phone, company: c.company, birth_date: c.birth_date ?? '', internal_notes: c.internal_notes, marketing_opt_in: c.marketing_opt_in });

  const doExport = async () => {
    try {
      const data = await exportCustomer(c.id);
      downloadText(`donnees-client-${c.last_name || c.id}-${todayInParis()}.json`, JSON.stringify(data, null, 2), 'application/json');
      toast.success('Export téléchargé.');
    } catch (e) {
      toast.error(e);
    }
  };

  if (c.anonymized_at) {
    return <p className="text-sm text-asphalt-300">Client anonymisé le {formatDateTime(c.anonymized_at)}. Les montants restent dans les exports comptables.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl font-bold uppercase">
          {c.first_name} {c.last_name}
        </h3>
        {c.has_account && <Chip tone="outline">Compte client</Chip>}
        <Chip tone="outline">Client depuis {formatDateTime(c.created_at).split(' · ')[0]}</Chip>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-asphalt-950 p-3 ring-1 ring-asphalt-800">
          <p className="font-display text-2xl font-bold">{c.bookings.length}</p>
          <p className="text-xs text-asphalt-400">réservations</p>
        </div>
        <div className="bg-asphalt-950 p-3 ring-1 ring-asphalt-800">
          <p className="font-display text-2xl font-bold">{formatPrice(c.paid_cents)}</p>
          <p className="text-xs text-asphalt-400">encaissés</p>
        </div>
        <div className="bg-asphalt-950 p-3 ring-1 ring-asphalt-800">
          <p className="font-display text-2xl font-bold">{c.gift_cards.length}</p>
          <p className="text-xs text-asphalt-400">bons achetés</p>
        </div>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: c.id, p: { ...form, birth_date: form.birth_date || null } }, { onSuccess: () => toast.success('Fiche enregistrée.'), onError: toast.error });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Prénom" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} />
          <Input label="Nom" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} />
          <Input label="Téléphone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Entreprise" value={form.company} onChange={(e) => set('company', e.target.value)} />
          <Input label="Date de naissance" type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} hint="Nécessaire pour la validation chrono" />
        </div>
        <Textarea label="Notes internes" value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} placeholder="Préférences, remarques de l’équipe…" />
        <Check label="Accepte de recevoir les actualités du circuit" checked={form.marketing_opt_in} onChange={(e) => set('marketing_opt_in', e.target.checked)} />
        {dirty && (
          <SmallButton type="submit" variant="primary" className="self-start" busy={update.isPending}>
            <Save aria-hidden />
            Enregistrer
          </SmallButton>
        )}
      </form>

      <section aria-labelledby="chrono-title" className="flex flex-wrap items-center justify-between gap-3 bg-asphalt-950 p-4 ring-1 ring-asphalt-800">
        <div>
          <h3 id="chrono-title" className="font-semibold">
            Validation chrono (Pack Rotax 22 CV)
          </h3>
          <p className="text-xs text-asphalt-400">
            {c.chrono_validated
              ? `Validée${c.chrono_validated_at ? ` le ${formatDateTime(c.chrono_validated_at)}` : ''}${c.chrono_validated_by ? ` par ${c.chrono_validated_by}` : ''}.`
              : 'Non validée : le pilote ne peut pas réserver le Pack Rotax en ligne.'}
          </p>
        </div>
        <SmallButton
          variant={c.chrono_validated ? 'default' : 'primary'}
          busy={chrono.isPending}
          onClick={() =>
            chrono.mutate(
              { id: c.id, validated: !c.chrono_validated },
              { onSuccess: () => toast.success(c.chrono_validated ? 'Validation retirée.' : 'Pilote validé.'), onError: toast.error },
            )
          }
        >
          <ShieldCheck aria-hidden />
          {c.chrono_validated ? 'Retirer la validation' : 'Valider le pilote'}
        </SmallButton>
      </section>

      <HistoryList title="Réservations" empty="Aucune réservation.">
        {c.bookings.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => setOpenBooking(b.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-asphalt-850">
              <span>
                <span className="font-semibold text-chalk">{formatDateTime(b.starts_at)}</span> · {b.product} · {b.participants_count} pers.
                <span className="block text-xs text-asphalt-400">{b.reference}</span>
              </span>
              <span className="flex items-center gap-2">
                {b.amount_due_cents > 0 && b.status !== 'cancelled' && <span className="text-xs text-flag-yellow">reste {formatPrice(b.amount_due_cents)}</span>}
                <StatusChip status={BOOKING_STATUS[b.status]} />
              </span>
            </button>
          </li>
        ))}
      </HistoryList>
      {c.requests.length > 0 && (
        <HistoryList title="Demandes" empty="">
          {c.requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {REQUEST_TYPE[r.type]} · {r.reference}
              </span>
              <StatusChip status={REQUEST_STATUS[r.status]} />
            </li>
          ))}
        </HistoryList>
      )}
      {c.gift_cards.length > 0 && (
        <HistoryList title="Bons cadeaux achetés" empty="">
          {c.gift_cards.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-mono">{g.status === 'pending_payment' ? g.order_reference : g.code}</span> · {formatPrice(g.initial_amount_cents)}
                {g.recipient_name && ` → ${g.recipient_name}`}
              </span>
              <StatusChip status={GIFT_STATUS[g.status]} />
            </li>
          ))}
        </HistoryList>
      )}
      {c.lap_records.length > 0 && (
        <HistoryList title="Chronos" empty="">
          {c.lap_records.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {l.track} · {l.category_label}
              </span>
              <span className="font-mono">{formatLapTime(l.lap_time_ms)}</span>
            </li>
          ))}
        </HistoryList>
      )}

      {isOwner && (
        <section aria-labelledby="rgpd-title" className="flex flex-col gap-2 border-t border-asphalt-800 pt-4">
          <h3 id="rgpd-title" className="font-display text-lg font-bold uppercase">
            Données personnelles (RGPD)
          </h3>
          <div className="flex flex-wrap gap-2">
            <SmallButton onClick={() => void doExport()}>
              <Download aria-hidden />
              Exporter les données (JSON)
            </SmallButton>
            <SmallButton variant="danger" onClick={() => setConfirmAnonymize(true)}>
              <UserX aria-hidden />
              Anonymiser le client
            </SmallButton>
          </div>
        </section>
      )}

      <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <ConfirmDialog
        open={confirmAnonymize}
        title="Anonymiser ce client ?"
        confirmLabel="Anonymiser définitivement"
        danger
        busy={anonymize.isPending}
        onClose={() => setConfirmAnonymize(false)}
        onConfirm={() =>
          anonymize.mutate(c.id, {
            onSuccess: () => {
              toast.success('Client anonymisé.');
              setConfirmAnonymize(false);
              onDeleted();
            },
            onError: toast.error,
          })
        }
      >
        <p>Nom, coordonnées, participants, messages et notes sont effacés de façon irréversible. Les montants restent pour la comptabilité.</p>
        <p>Les réservations à venir doivent d’abord être annulées.</p>
      </ConfirmDialog>
    </div>
  );
}

function HistoryList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-lg font-bold uppercase">{title}</h3>
      {children.length === 0 ? <p className="text-sm text-asphalt-400">{empty}</p> : <ul className="divide-y divide-asphalt-800 ring-1 ring-asphalt-800">{children}</ul>}
    </section>
  );
}
