import { Ban, CheckCircle2, FileDown, Plus, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { Alert, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { contactContent } from '@/lib/catalog';
import { errorMessage } from '@/lib/data/errors';
import { formatDay, formatPrice, isoToParisDay } from '@/lib/format';
import { downloadGiftCardPdf } from '@/lib/giftcard-pdf';
import { useSiteBundle } from '@/lib/queries';
import { useActivateGiftCard, useAdjustGiftCard, useAdminCatalog, useGiftCard, useGiftCards, useIssueGiftCard, useSetGiftCardStatus } from '../api';
import { customerEmail, customerPayload, type CustomerChoice } from '../components/customer-choice';
import { CustomerPicker } from '../components/CustomerPicker';
import { COUNTER_METHODS, eurosToCents, formatDateTime, GIFT_SOURCE, GIFT_STATUS, GIFT_TX, PAYMENT_METHOD } from '../labels';
import { useStaffMember } from '../role-context';
import { useToast } from '../toast-context';
import type { AdminGiftCard, AdminGiftCardDetails, GiftCardStatus, PaymentMethod } from '../types';
import { AdminPage, Check, ConfirmDialog, DataTable, DefinitionList, Input, Modal, Pagination, Panel, SearchInput, Segmented, Select, SmallButton, StatusChip, Textarea, type Column } from '../ui';

const LIMIT = 50;

export default function GiftCardsPage() {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const [status, setStatus] = useState<'all' | GiftCardStatus>('all');
  const [offset, setOffset] = useState(0);
  const cards = useGiftCards({ q: deferred || undefined, status: status === 'all' ? undefined : [status], limit: LIMIT, offset });
  const [openId, setOpenId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const columns: Column<AdminGiftCard>[] = [
    {
      key: 'code',
      header: 'Bon',
      cell: (g) => (
        <span className="flex flex-col">
          <span className="font-mono tracking-wide">{g.status === 'pending_payment' ? (g.order_reference ?? 'En attente') : g.code}</span>
          <span className="text-xs font-normal text-asphalt-400">{g.status === 'pending_payment' ? 'Commande à encaisser' : GIFT_SOURCE[g.source]}</span>
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Valeur',
      cell: (g) => (
        <span className="flex flex-col">
          <span>{g.kind === 'product' ? g.product : formatPrice(g.initial_amount_cents)}</span>
          {g.status === 'active' && g.balance_cents < g.initial_amount_cents && <span className="text-xs text-asphalt-400">solde {formatPrice(g.balance_cents)}</span>}
        </span>
      ),
    },
    {
      key: 'people',
      header: 'Acheteur → bénéficiaire',
      cell: (g) => (
        <span className="text-asphalt-200">
          {g.purchaser?.name ?? '—'}
          {g.recipient_name && <span className="text-asphalt-400"> → {g.recipient_name}</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Statut', cell: (g) => <StatusChip status={GIFT_STATUS[g.status]} /> },
    {
      key: 'date',
      header: 'Validité',
      cell: (g) => <span className="text-asphalt-300">{g.expires_at ? `jusqu’au ${formatDay(isoToParisDay(g.expires_at), { day: 'numeric', month: 'short', year: 'numeric' })}` : g.ordered_at ? `commandé ${formatDateTime(g.ordered_at)}` : '—'}</span>,
    },
  ];

  return (
    <AdminPage
      title="Bons cadeaux"
      description="Commandes à encaisser, bons actifs, soldes et historique. Un bon commandé en ligne n’est activé (et son code envoyé) qu’après encaissement."
      actions={
        <SmallButton variant="primary" onClick={() => setIssuing(true)}>
          <Plus aria-hidden />
          Émettre un bon
        </SmallButton>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
          placeholder="Code, commande BC-…, nom, email…"
        />
        <Segmented
          label="Statut"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setOffset(0);
          }}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'pending_payment', label: 'À encaisser' },
            { value: 'active', label: 'Actifs' },
            { value: 'exhausted', label: 'Utilisés' },
            { value: 'expired', label: 'Expirés' },
            { value: 'disabled', label: 'Désactivés' },
          ]}
        />
      </div>
      <Panel padded={false}>
        {cards.isError ? (
          <div className="p-4">
            <ErrorPanel message={errorMessage(cards.error)} onRetry={() => void cards.refetch()} />
          </div>
        ) : (
          <>
            <DataTable caption="Bons cadeaux" rows={cards.data?.rows} columns={columns} rowKey={(g) => g.id} onRowClick={(g) => setOpenId(g.id)} loading={cards.isPending} empty="Aucun bon." />
            {cards.data && <Pagination total={cards.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />}
          </>
        )}
      </Panel>
      <Modal open={!!openId} onClose={() => setOpenId(null)} side title="Bon cadeau">
        {openId && <GiftCardDetails id={openId} />}
      </Modal>
      <Modal open={issuing} onClose={() => setIssuing(false)} wide title="Émettre un bon cadeau">
        {issuing && <IssueForm onClose={() => setIssuing(false)} onIssued={setOpenId} />}
      </Modal>
    </AdminPage>
  );
}

function GiftCardDetails({ id }: { id: string }) {
  const card = useGiftCard(id);
  const { isOwner } = useStaffMember();
  const toast = useToast();
  const bundle = useSiteBundle().data;
  const contact = bundle ? contactContent(bundle) : undefined;
  const activate = useActivateGiftCard();
  const setStatus = useSetGiftCardStatus();
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [adjusting, setAdjusting] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  if (card.isPending) return <Skeleton className="h-64" />;
  if (card.isError) return <ErrorPanel message={errorMessage(card.error)} />;
  const g: AdminGiftCardDetails = card.data;
  const pending = g.status === 'pending_payment';

  const downloadPdf = () =>
    contact &&
    downloadGiftCardPdf(
      {
        code: g.code,
        kind: g.kind,
        amountCents: g.initial_amount_cents,
        productName: g.product,
        recipientName: g.recipient_name,
        fromName: g.purchaser?.name.split(' ')[0],
        message: g.message,
        expiresAt: g.expires_at,
      },
      { name: contact.title, address: contact.data.address, postalCode: contact.data.postal_code, city: contact.data.city, phone: contact.data.phone },
    ).catch(toast.error);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={GIFT_STATUS[g.status]} />
        <Chip tone="outline">{GIFT_SOURCE[g.source]}</Chip>
        {g.order_reference && <Chip tone="outline">Commande {g.order_reference}</Chip>}
      </div>
      <p className="font-mono text-2xl tracking-wider text-chalk">{pending ? 'Code généré à l’encaissement' : g.code}</p>
      <DefinitionList
        items={[
          ['Valeur', g.kind === 'product' ? `${g.product} (${formatPrice(g.initial_amount_cents)})` : formatPrice(g.initial_amount_cents)],
          !pending && ['Solde', <strong key="b">{formatPrice(g.balance_cents)}</strong>],
          ['Acheteur', g.purchaser ? (
            <Link key="p" to={`/admin/clients?fiche=${g.purchaser.id}`} className="underline underline-offset-2">
              {g.purchaser.name}
            </Link>
          ) : '—'],
          g.purchaser && ['Contact', [g.purchaser.phone, g.purchaser.email].filter(Boolean).join(' · ')],
          ['Bénéficiaire', g.recipient_name || '—'],
          g.recipient_email && ['Email bénéficiaire', g.recipient_email],
          g.order_reference && ['Envoi', g.deliver_to === 'recipient' ? 'Directement au bénéficiaire (et copie acheteur)' : 'À l’acheteur'],
          g.message && ['Message', <span key="m" className="italic">« {g.message} »</span>],
          g.ordered_at && ['Commandé le', formatDateTime(g.ordered_at)],
          g.issued_at && ['Émis le', formatDateTime(g.issued_at)],
          g.expires_at && ['Valable jusqu’au', formatDay(isoToParisDay(g.expires_at), { day: 'numeric', month: 'long', year: 'numeric' })],
          g.origin_booking && ['Avoir de', g.origin_booking],
          g.created_by && ['Émis par', g.created_by],
        ]}
      />

      {pending && (
        <section className="flex flex-col gap-3 bg-flag-yellow/10 p-4 ring-1 ring-flag-yellow/40">
          <p className="text-sm text-chalk">
            Encaissez <strong>{formatPrice(g.initial_amount_cents)}</strong> puis activez le bon : le code est généré et le PDF part par email
            {g.deliver_to === 'recipient' ? ' à l’acheteur et au bénéficiaire.' : ' à l’acheteur.'}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Moyen de paiement" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-56">
              {COUNTER_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </Select>
            <SmallButton
              variant="primary"
              className="h-10"
              busy={activate.isPending}
              onClick={() =>
                activate.mutate({ id: g.id, method }, { onSuccess: (c) => toast.success(`Bon ${c.code} activé et envoyé.`), onError: toast.error })
              }
            >
              <CheckCircle2 aria-hidden />
              Encaissé : activer le bon
            </SmallButton>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {!pending && (
          <SmallButton onClick={() => void downloadPdf()}>
            <FileDown aria-hidden />
            Télécharger le PDF
          </SmallButton>
        )}
        {isOwner && !pending && g.status !== 'disabled' && (
          <SmallButton onClick={() => setAdjusting(true)}>
            <SlidersHorizontal aria-hidden />
            Ajuster le solde
          </SmallButton>
        )}
        {isOwner && (g.status === 'active' || g.status === 'exhausted') && (
          <SmallButton variant="danger" onClick={() => setConfirmDisable(true)}>
            <Ban aria-hidden />
            Désactiver
          </SmallButton>
        )}
        {isOwner && g.status === 'disabled' && (
          <SmallButton onClick={() => setStatus.mutate({ id: g.id, status: 'active' }, { onSuccess: () => toast.success('Bon réactivé.'), onError: toast.error })}>
            Réactiver
          </SmallButton>
        )}
      </div>
      {!isOwner && !pending && <p className="text-xs text-asphalt-400">L’ajustement et la désactivation sont réservés au dirigeant.</p>}

      {g.transactions.length > 0 && (
        <section aria-labelledby="gc-history" className="flex flex-col gap-2">
          <h3 id="gc-history" className="font-display text-lg font-bold uppercase">
            Mouvements
          </h3>
          <ul className="flex flex-col divide-y divide-asphalt-800 text-sm ring-1 ring-asphalt-800">
            {g.transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-semibold">{GIFT_TX[t.kind]}</span>
                  {t.booking_reference && <span className="text-asphalt-400"> · {t.booking_reference}</span>}
                  {t.note && <span className="text-asphalt-400"> · {t.note}</span>}
                  <span className="block text-xs text-asphalt-400">
                    {formatDateTime(t.created_at)}
                    {t.created_by && ` · ${t.created_by}`}
                  </span>
                </span>
                <span className="text-right tabular">
                  <span className={t.amount_cents < 0 ? 'text-race-400' : 'text-flag-green'}>
                    {t.amount_cents < 0 ? '−' : '+'}
                    {formatPrice(Math.abs(t.amount_cents))}
                  </span>
                  <span className="block text-xs text-asphalt-400">solde {formatPrice(t.balance_after_cents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdjustDialog card={g} open={adjusting} onClose={() => setAdjusting(false)} />
      <ConfirmDialog
        open={confirmDisable}
        title="Désactiver ce bon ?"
        confirmLabel="Désactiver"
        danger
        busy={setStatus.isPending}
        onClose={() => setConfirmDisable(false)}
        onConfirm={() =>
          setStatus.mutate(
            { id: g.id, status: 'disabled' },
            {
              onSuccess: () => {
                toast.success('Bon désactivé.');
                setConfirmDisable(false);
              },
              onError: toast.error,
            },
          )
        }
      >
        Le code ne sera plus accepté en réservation ni à l’accueil. Il reste possible de le réactiver.
      </ConfirmDialog>
    </div>
  );
}

function AdjustDialog({ card, open, onClose }: { card: AdminGiftCardDetails; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const adjust = useAdjustGiftCard();
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [note, setNote] = useState('');
  const cents = eurosToCents(amount);
  return (
    <ConfirmDialog
      open={open}
      title="Ajuster le solde"
      confirmLabel="Ajuster"
      busy={adjust.isPending}
      onClose={onClose}
      onConfirm={() =>
        cents &&
        cents > 0 &&
        note.trim() &&
        adjust.mutate(
          { id: card.id, amount: direction === 'debit' ? -cents : cents, note: note.trim() },
          {
            onSuccess: (balance) => {
              toast.success(`Nouveau solde : ${formatPrice(balance)}.`);
              setAmount('');
              setNote('');
              onClose();
            },
            onError: toast.error,
          },
        )
      }
    >
      <p>Solde actuel : {formatPrice(card.balance_cents)} (maximum {formatPrice(card.initial_amount_cents)}).</p>
      <Segmented
        label="Sens"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'debit', label: 'Débiter (utilisation à l’accueil)' },
          { value: 'credit', label: 'Recréditer' },
        ]}
      />
      <Input label="Montant" inputMode="decimal" suffix="€" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input label="Motif (obligatoire)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. utilisé au comptoir le…" />
    </ConfirmDialog>
  );
}

function IssueForm({ onClose, onIssued }: { onClose: () => void; onIssued: (id: string) => void }) {
  const toast = useToast();
  const catalog = useAdminCatalog();
  const issue = useIssueGiftCard();
  const [kind, setKind] = useState<'amount' | 'product'>('amount');
  const [amount, setAmount] = useState('50');
  const [productId, setProductId] = useState('');
  const [purchaser, setPurchaser] = useState<CustomerChoice>(null);
  const [recipient, setRecipient] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [sendEmail, setSendEmail] = useState(true);
  const products = (catalog.data?.products ?? []).filter((p) => p.is_active && p.price_cents != null && (p.kind === 'session' || p.kind === 'pack' || p.kind === 'experience'));
  const cents = eurosToCents(amount);
  const destination = recipientEmail.trim() || customerEmail(purchaser);
  const invalid = kind === 'amount' ? !cents || cents <= 0 : !productId;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const who = customerPayload(purchaser);
        issue.mutate(
          {
            kind,
            amount_cents: kind === 'amount' ? cents : undefined,
            product_id: kind === 'product' ? productId : undefined,
            purchaser_customer_id: who.customer_id,
            purchaser: who.customer,
            recipient_name: recipient.trim(),
            recipient_email: recipientEmail.trim() || null,
            message: message.trim(),
            payment: paid ? { method } : null,
            send_email: sendEmail && !!destination,
          },
          {
            onSuccess: (card) => {
              toast.success(paid ? `Bon ${card.code} émis.` : 'Bon créé, en attente d’encaissement.');
              onClose();
              onIssued(card.id);
            },
            onError: toast.error,
          },
        );
      }}
    >
      <Segmented
        label="Type de bon"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'amount', label: 'Montant libre' },
          { value: 'product', label: 'Activité précise' },
        ]}
      />
      {kind === 'amount' ? (
        <Input label="Montant" inputMode="decimal" suffix="€" value={amount} onChange={(e) => setAmount(e.target.value)} className="sm:max-w-xs" error={invalid ? 'Montant invalide.' : undefined} />
      ) : (
        <Select label="Activité" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Choisir…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatPrice(p.price_cents!)}
            </option>
          ))}
        </Select>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Acheteur (facultatif)</legend>
        <CustomerPicker value={purchaser} onChange={setPurchaser} />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Bénéficiaire" value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={80} />
        <Input label="Email du bénéficiaire" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} hint="Le bon lui est envoyé directement" />
      </div>
      <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2} />
      <div className="flex flex-col gap-3 bg-asphalt-950 p-3 ring-1 ring-asphalt-800">
        <Check label="Encaissé maintenant (le bon est actif immédiatement)" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        {paid && (
          <Select label="Moyen de paiement" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="sm:max-w-xs">
            {COUNTER_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD[m]}
              </option>
            ))}
          </Select>
        )}
        {paid && (
          <Check
            label={destination ? `Envoyer le bon (PDF) par email à ${destination}` : 'Aucun email : remettez le PDF en main propre'}
            checked={sendEmail && !!destination}
            disabled={!destination}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
        )}
      </div>
      {!paid && <Alert>Le bon sera créé en attente : activez-le depuis sa fiche une fois encaissé.</Alert>}
      <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={issue.isPending} disabled={invalid}>
          Émettre le bon
        </SmallButton>
      </div>
    </form>
  );
}
