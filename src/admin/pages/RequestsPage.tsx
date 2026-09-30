import { Ban, HandCoins, Mail, Phone, Save } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import { formatDay, formatPrice, todayInParis } from '@/lib/format';
import { useRequests, useUpdateRequest } from '../api';
import { useNow } from '../hooks';
import { emptyDraft } from '../components/block-draft';
import { BlockDialog } from '../components/BlockDialog';
import { PaymentDialog } from '../components/PaymentDialog';
import { BLOCK_REASON, centsToEuros, eurosToCents, formatDateTime, REQUEST_PIPELINE, REQUEST_STATUS, REQUEST_TYPE } from '../labels';
import { useToast } from '../toast-context';
import type { AdminRequest, RequestStatus } from '../types';
import { AdminPage, Check, DefinitionList, Input, Modal, SearchInput, Select, SmallButton, StatusChip, Textarea } from '../ui';

const DETAIL_LABELS: Record<string, string> = {
  subject: 'Sujet',
  formula: 'Formule',
  child_name: 'Prénom de l’enfant',
  child_age: 'Âge',
  company: 'Entreprise',
  level: 'Niveau',
  vehicle: 'Véhicule',
};

export default function RequestsPage() {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const [showClosed, setShowClosed] = useState(false);
  const requests = useRequests({ q: deferred || undefined });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = requests.data?.find((r) => r.id === openId) ?? null;

  const byStatus = (status: RequestStatus) => (requests.data ?? []).filter((r) => r.status === status);
  const closed = (requests.data ?? []).filter((r) => r.status === 'cancelled' || r.status === 'lost');

  return (
    <AdminPage
      title="Demandes"
      description="Anniversaires, EVG/EVJF, team building, école de pilotage, Alpine : du premier contact au règlement. Chaque changement d’étape peut prévenir le client par email."
      actions={<SearchInput value={q} onChange={setQ} placeholder="Référence, nom, email, entreprise…" />}
    >
      {requests.isError ? (
        <ErrorPanel message={errorMessage(requests.error)} onRetry={() => void requests.refetch()} />
      ) : requests.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {REQUEST_PIPELINE.map((status) => {
              const items = byStatus(status);
              return (
                <section key={status} aria-labelledby={`col-${status}`} className="flex min-w-0 flex-col gap-2 bg-asphalt-900 p-3 ring-1 ring-asphalt-800">
                  <h2 id={`col-${status}`} className="flex items-center justify-between font-display text-lg font-bold uppercase">
                    {REQUEST_STATUS[status].label}
                    <span className="text-sm text-asphalt-400">{items.length}</span>
                  </h2>
                  {items.length === 0 && <p className="text-xs text-asphalt-400">—</p>}
                  <ul className="flex flex-col gap-2">
                    {items.map((r) => (
                      <li key={r.id}>
                        <RequestCard request={r} onOpen={() => setOpenId(r.id)} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <SmallButton variant="ghost" className="self-start" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
              {showClosed ? 'Masquer' : 'Afficher'} les demandes annulées ou perdues ({closed.length})
            </SmallButton>
            {showClosed && (
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {closed.map((r) => (
                  <li key={r.id}>
                    <RequestCard request={r} onOpen={() => setOpenId(r.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      <Modal open={!!open} onClose={() => setOpenId(null)} side title={open ? `Demande ${open.reference}` : 'Demande'}>
        {open && <RequestDetails key={open.id} request={open} />}
      </Modal>
    </AdminPage>
  );
}

function RequestCard({ request: r, onOpen }: { request: AdminRequest; onOpen: () => void }) {
  const now = useNow();
  const age = Math.floor((now - Date.parse(r.created_at)) / 3_600_000);
  return (
    <button type="button" onClick={onOpen} className={cx('flex w-full flex-col gap-1 bg-asphalt-850 p-3 text-left ring-1 ring-asphalt-700 hover:ring-race-400', r.status === 'new' && 'border-l-4 border-race-500')}>
      <span className="flex items-center justify-between gap-2 text-xs text-asphalt-400">
        <span>{REQUEST_TYPE[r.type]}</span>
        <span>{r.status === 'new' ? (age < 24 ? `il y a ${Math.max(age, 0)} h` : `il y a ${Math.floor(age / 24)} j`) : r.reference}</span>
      </span>
      <span className="font-semibold text-chalk">{r.company || r.contact_name}</span>
      <span className="text-xs text-asphalt-300">
        {r.preferred_date ? formatDay(r.preferred_date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Date à définir'}
        {r.participants_count ? ` · ${r.participants_count} pers.` : ''}
        {r.quote_amount_cents != null ? ` · devis ${formatPrice(r.quote_amount_cents)}` : ''}
      </span>
      {r.block && <span className="text-xs text-flag-blue">Planning bloqué · {BLOCK_REASON[r.block.reason]}</span>}
    </button>
  );
}

function RequestDetails({ request: r }: { request: AdminRequest }) {
  const toast = useToast();
  const update = useUpdateRequest();
  const [status, setStatus] = useState<RequestStatus>(r.status);
  const [quote, setQuote] = useState(centsToEuros(r.quote_amount_cents));
  const [deposit, setDeposit] = useState(centsToEuros(r.deposit_cents));
  const [note, setNote] = useState(r.internal_note);
  const [date, setDate] = useState(r.preferred_date ?? '');
  const [count, setCount] = useState(r.participants_count ? String(r.participants_count) : '');
  const [notify, setNotify] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const statusChanged = status !== r.status;
  const emailSent = statusChanged && ['quoted', 'confirmed', 'cancelled'].includes(status);
  const quoteCents = eurosToCents(quote);
  const balance = (r.quote_amount_cents ?? 0) - r.paid_cents;

  const save = () =>
    update.mutate(
      {
        id: r.id,
        p: {
          status,
          quote_amount_cents: quoteCents,
          deposit_cents: eurosToCents(deposit),
          internal_note: note,
          preferred_date: date || null,
          participants_count: count ? Number(count) : null,
          notify_customer: notify,
        },
      },
      {
        onSuccess: () => toast.success(emailSent && notify ? 'Demande mise à jour, email envoyé au client.' : 'Demande mise à jour.'),
        onError: toast.error,
      },
    );

  const details = Object.entries(r.details ?? {}).filter(([, v]) => v !== null && v !== '');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <StatusChip status={REQUEST_STATUS[r.status]} />
        <Chip tone="outline">{REQUEST_TYPE[r.type]}</Chip>
      </div>
      <DefinitionList
        items={[
          ['Contact', r.contact_name + (r.company ? ` · ${r.company}` : '')],
          [
            'Coordonnées',
            <span key="c" className="flex flex-col">
              <a href={`mailto:${r.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-race-400">
                <Mail aria-hidden className="size-3.5" />
                {r.contact_email}
              </a>
              {r.contact_phone && (
                <a href={`tel:${r.contact_phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-race-400">
                  <Phone aria-hidden className="size-3.5" />
                  {r.contact_phone}
                </a>
              )}
            </span>,
          ],
          ['Reçue le', formatDateTime(r.created_at)],
          r.alternative_date && ['Date alternative', formatDay(r.alternative_date)],
          r.product && ['Formule', r.product],
          ...details.map(([k, v]) => [DETAIL_LABELS[k] ?? k, String(v)] as [string, string]),
          [
            'Fiche client',
            <Link key="f" to={`/admin/clients?fiche=${r.customer_id}`} className="underline underline-offset-2">
              Ouvrir la fiche
            </Link>,
          ],
        ]}
      />
      {r.message && <blockquote className="whitespace-pre-wrap border-l-2 border-asphalt-600 pl-3 text-sm text-asphalt-200">{r.message}</blockquote>}

      <section aria-labelledby="req-follow" className="flex flex-col gap-3">
        <h3 id="req-follow" className="font-display text-lg font-bold uppercase">
          Suivi
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Étape" value={status} onChange={(e) => setStatus(e.target.value as RequestStatus)}>
            {(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS[s].label}
              </option>
            ))}
          </Select>
          <Input label="Date prévue" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Montant du devis" inputMode="decimal" suffix="€" value={quote} onChange={(e) => setQuote(e.target.value)} />
          <Input label="Acompte demandé" inputMode="decimal" suffix="€" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <Input label="Participants" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <Textarea label="Note interne" value={note} onChange={(e) => setNote(e.target.value)} />
        {emailSent && <Check label={`Envoyer l’email « ${REQUEST_STATUS[status].label} » au client`} checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
        {status === 'quoted' && quoteCents == null && <p className="text-xs text-flag-yellow">Indiquez le montant du devis : il figure dans l’email.</p>}
        <SmallButton variant="primary" className="self-start" busy={update.isPending} onClick={save}>
          <Save aria-hidden />
          Enregistrer
        </SmallButton>
      </section>

      <section aria-labelledby="req-money" className="flex flex-col gap-2 bg-asphalt-950 p-4 ring-1 ring-asphalt-800">
        <h3 id="req-money" className="font-display text-lg font-bold uppercase">
          Règlements
        </h3>
        <p className="text-sm text-asphalt-200">
          Encaissé : <strong className="text-chalk">{formatPrice(r.paid_cents)}</strong>
          {r.quote_amount_cents != null && ` sur ${formatPrice(r.quote_amount_cents)}`}
          {r.quote_amount_cents != null && balance <= 0 && r.status !== 'paid' && <span className="text-flag-green"> · soldé, passez la demande en « Réglée »</span>}
        </p>
        <SmallButton className="self-start" onClick={() => setPayOpen(true)}>
          <HandCoins aria-hidden />
          Encaisser (acompte ou solde)
        </SmallButton>
      </section>

      <section aria-labelledby="req-block" className="flex flex-col gap-2">
        <h3 id="req-block" className="font-display text-lg font-bold uppercase">
          Planning
        </h3>
        {r.block ? (
          <p className="text-sm text-asphalt-200">
            Plage bloquée le {formatDateTime(r.block.starts_at)} ({BLOCK_REASON[r.block.reason]}).{' '}
            <Link to="/admin/blocages" className="underline underline-offset-2">
              Voir les blocages
            </Link>
          </p>
        ) : (
          <SmallButton className="self-start" onClick={() => setBlockOpen(true)}>
            <Ban aria-hidden />
            Bloquer le planning pour cette demande
          </SmallButton>
        )}
      </section>

      <BlockDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={`Bloquer le planning · ${r.reference}`}
        initial={emptyDraft(r.preferred_date ?? todayInParis(), {
          block_type: 'afternoon',
          reason: r.type === 'team_building' ? 'team_building' : 'private_event',
          internal_note: `${REQUEST_TYPE[r.type]} · ${r.company || r.contact_name} · ${r.reference}`,
          customer_id: r.customer_id,
          request_id: r.id,
        })}
      />
      <PaymentDialog
        open={payOpen}
        kind="payment"
        defaultCents={Math.max(balance, 0) || r.deposit_cents || 0}
        target={{ request_id: r.id }}
        title={`Encaisser · ${r.reference}`}
        onClose={() => setPayOpen(false)}
      />
    </div>
  );
}
