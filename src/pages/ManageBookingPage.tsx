import { CalendarPlus, CalendarSync, CircleCheck, LoaderCircle, Mail, Phone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { QrCode } from '@/components/booking/QrCode';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { Seo } from '@/components/Seo';
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Alert, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Container, Eyebrow, Kerb } from '@/components/ui/layout';
import { createHold, releaseHold, useCancelBooking, useManagedBooking, useRescheduleBooking } from '@/lib/booking-queries';
import { contactContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { errorMessage, RpcError } from '@/lib/data/errors';
import type { AvailabilitySlot, BookingStatus, CancellationResult, ManagedBooking } from '@/lib/data/types';
import { env } from '@/lib/env';
import { capitalize, formatDay, formatPrice, formatTime, isoToParisDay } from '@/lib/format';
import { buildIcs, downloadIcs } from '@/lib/ics';
import { useBundle, useCatalog } from '@/lib/queries';

const STATUS: Record<BookingStatus, { label: string; tone: 'green' | 'yellow' | 'neutral' | 'blue' | 'red' }> = {
  pending: { label: 'En attente', tone: 'yellow' },
  confirmed: { label: 'Confirmée', tone: 'green' },
  checked_in: { label: 'Présent', tone: 'blue' },
  completed: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'red' },
  no_show: { label: 'Absent', tone: 'neutral' },
  reschedule_required: { label: 'À reporter', tone: 'yellow' },
};

function endOf(b: ManagedBooking): string {
  return b.event?.ends_at ?? b.sessions.at(-1)?.ends_at ?? b.starts_at;
}

export default function ManageBookingPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const booking = useManagedBooking(token);

  if (booking.isPending) {
    return (
      <Container className="flex flex-col gap-4 py-16">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }
  if (booking.isError) {
    const notFound = RpcError.from(booking.error).code === 'KR_BOOKING_NOT_FOUND';
    return (
      <Container className="flex flex-col items-start gap-5 py-16">
        <Seo title="Réservation · Karting Roussillon" noIndex />
        <h1 className="text-display-lg font-extrabold uppercase">{notFound ? 'Réservation introuvable' : 'Chargement impossible'}</h1>
        {notFound ? (
          <p className="max-w-lg text-asphalt-200">Ce lien ne correspond à aucune réservation. Vérifiez le lien reçu par email ou contactez le circuit.</p>
        ) : (
          <ErrorPanel message={errorMessage(booking.error)} onRetry={() => booking.refetch()} />
        )}
        <ButtonLink to="/reserver">Réserver une session</ButtonLink>
      </Container>
    );
  }
  return <BookingView booking={booking.data} token={token} justConfirmed={params.get('confirmee') === '1'} />;
}

function BookingView({ booking: b, token, justConfirmed }: { booking: ManagedBooking; token: string; justConfirmed: boolean }) {
  const bundle = useBundle();
  const catalog = useCatalog();
  const contact = contactContent(bundle);
  const [mode, setMode] = useState<'view' | 'reschedule' | 'cancel'>('view');
  const [cancelResult, setCancelResult] = useState<CancellationResult | null>(null);
  const [rescheduled, setRescheduled] = useState(false);
  const status = STATUS[b.status];
  const title = b.product?.name ?? b.event?.title ?? 'Réservation';
  const active = b.status === 'pending' || b.status === 'confirmed' || b.status === 'reschedule_required';
  const showQr = b.status === 'pending' || b.status === 'confirmed' || b.status === 'checked_in';
  const manageUrl = `${window.location.origin}/reservation/${b.qr_token}`;
  const showConfirmation = justConfirmed && (b.status === 'pending' || b.status === 'confirmed');

  const heading = showConfirmation
    ? 'C’est réservé !'
    : b.status === 'cancelled'
      ? 'Réservation annulée'
      : b.status === 'reschedule_required'
        ? 'Un changement est nécessaire'
        : title;

  const addToCalendar = () => {
    const address = contact ? `${contact.data.address}, ${contact.data.postal_code} ${contact.data.city}` : undefined;
    downloadIcs(
      `karting-roussillon-${b.reference}.ics`,
      buildIcs({
        uid: `${b.id}@kartingroussillon`,
        start: b.event?.starts_at ?? b.starts_at,
        end: endOf(b),
        title: `${title} · ${contact?.title ?? 'Karting'}`,
        location: address,
        description: `Réservation ${b.reference}. Gérer : ${manageUrl}`,
        url: manageUrl,
      }),
    );
  };

  return (
    <>
      <Seo title={`Réservation ${b.reference} · Karting Roussillon`} noIndex />
      <header className="relative border-b border-asphalt-800">
        <Container className="flex flex-col gap-4 py-10 sm:py-14">
          <Eyebrow>Réservation {b.reference}</Eyebrow>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-display-xl font-extrabold uppercase">{heading}</h1>
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
          {showConfirmation && b.customer.email && (
            <Alert tone="success" title="Confirmation envoyée">
              Un email récapitulatif avec votre QR code part à <strong className="text-chalk">{b.customer.email}</strong>. Gardez ce lien : il
              permet de reporter ou d'annuler.
              {env.dataSource === 'demo' && (
                <>
                  {' '}
                  <Link to="/demo/emails" className="font-semibold text-race-400 underline underline-offset-2">
                    Voir l'email (démo)
                  </Link>
                </>
              )}
            </Alert>
          )}
          {b.status === 'reschedule_required' && (
            <Alert tone="error" title="Le circuit a dû fermer votre créneau">
              Choisissez une nouvelle date, ou annulez sans frais : les montants déjà réglés vous sont intégralement restitués.
            </Alert>
          )}
          {rescheduled && <Alert tone="success" title="Nouvel horaire confirmé">Un email avec les nouvelles informations vous a été envoyé.</Alert>}
        </Container>
        <Kerb className="absolute inset-x-0 bottom-0" />
      </header>

      <Container className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="details-title" className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800 sm:p-6">
            <h2 id="details-title" className="font-display text-lg font-bold uppercase">
              Détails
            </h2>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm text-asphalt-400">Activité</dt>
              <dd className="font-semibold">{title}</dd>
              <dt className="text-sm text-asphalt-400">Date</dt>
              <dd>
                <span className="block font-semibold">{capitalize(formatDay(isoToParisDay(b.event?.starts_at ?? b.starts_at)))}</span>
                {b.event ? (
                  <span className="tabular text-asphalt-200">
                    {formatTime(b.event.starts_at)} – {formatTime(b.event.ends_at)}
                  </span>
                ) : (
                  b.sessions.map((s) => (
                    <span key={s.slot_id} className="block tabular text-asphalt-200">
                      {formatTime(s.starts_at)} · {s.track}
                    </span>
                  ))
                )}
              </dd>
              <dt className="text-sm text-asphalt-400">Participants</dt>
              <dd>
                {b.participants.map((p) => (
                  <span key={p.id} className="block">
                    {p.first_name} {p.last_name}
                    {p.role === 'passenger' && <span className="text-asphalt-400"> · passager</span>}
                  </span>
                ))}
              </dd>
              <dt className="text-sm text-asphalt-400">Montant</dt>
              <dd className="flex flex-col gap-0.5 tabular">
                <span>Total : {formatPrice(b.total_cents)}</span>
                {b.gift_card_applied_cents > 0 && <span className="text-flag-green">Bon cadeau : − {formatPrice(b.gift_card_applied_cents)}</span>}
                {b.paid_cents > 0 && <span>Déjà réglé : − {formatPrice(b.paid_cents)}</span>}
                {active && <span className="font-display text-2xl font-bold">À régler sur place : {formatPrice(b.amount_due_cents)}</span>}
              </dd>
            </dl>
          </section>

          {cancelResult && <CancellationSummary result={cancelResult} />}

          {mode === 'reschedule' && b.product && (
            <ReschedulePanel booking={b} token={token} catalogPack={catalog.productBySlug.get(b.product.slug)?.pack ?? null} horizonDays={Number(bundle.settings.booking_horizon_days ?? 90)} onDone={() => { setMode('view'); setRescheduled(true); }} onCancel={() => setMode('view')} />
          )}
          {mode === 'cancel' && <CancelPanel booking={b} token={token} onDone={(result) => { setCancelResult(result); setMode('view'); }} onCancel={() => setMode('view')} />}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-28">
          {showQr && (
            <div className="flex flex-col items-center gap-3 bg-asphalt-900 p-5 text-center ring-1 ring-asphalt-800">
              <QrCode value={manageUrl} label={`QR code de la réservation ${b.reference}`} />
              <p className="text-sm text-asphalt-300">À présenter à l'accueil du circuit</p>
              <p className="font-display text-2xl font-bold tracking-[0.12em]">{b.reference}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {active && (
              <Button variant="secondary" block onClick={addToCalendar}>
                <CalendarPlus aria-hidden className="size-4" />
                Ajouter à mon agenda
              </Button>
            )}
            {b.can_reschedule && mode !== 'reschedule' && (
              <Button variant="secondary" block onClick={() => setMode('reschedule')}>
                <CalendarSync aria-hidden className="size-4" />
                Reporter
              </Button>
            )}
            {b.can_cancel && mode !== 'cancel' && (
              <Button variant="ghost" block onClick={() => setMode('cancel')}>
                <XCircle aria-hidden className="size-4" />
                Annuler la réservation
              </Button>
            )}
            {active && !b.can_cancel && contact && (
              <p className="text-sm text-asphalt-400">
                Pour modifier ou annuler à moins de {Number(bundle.settings.cancel_credit_hours ?? 24)} h du départ, appelez le circuit.
              </p>
            )}
            {contact && (
              <ButtonAnchor href={`tel:${contact.data.phone_e164}`} variant="ghost" block>
                <Phone aria-hidden className="size-4" />
                {contact.data.phone}
              </ButtonAnchor>
            )}
          </div>
        </aside>
      </Container>
    </>
  );
}

function CancellationSummary({ result }: { result: CancellationResult }) {
  const lines: string[] = [];
  if (result.gift_card_recredited_cents > 0) lines.push(`${formatPrice(result.gift_card_recredited_cents)} ont été recrédités sur votre bon cadeau.`);
  if (result.outcome === 'refund_due') lines.push(`Le circuit vous rembourse les ${formatPrice(result.paid_cents)} déjà réglés.`);
  return (
    <Alert tone="success" title="Annulation enregistrée">
      {lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      {result.credit_code && (
        <span className="mt-2 block">
          Avoir de <strong className="text-chalk">{formatPrice(result.credit_amount_cents ?? 0)}</strong> : code{' '}
          <strong className="font-display text-lg tracking-[0.12em] text-chalk">{result.credit_code}</strong>
        </span>
      )}
      <span className="mt-2 flex items-center gap-1.5">
        <Mail aria-hidden className="size-4" />
        Une confirmation vous est envoyée par email.
      </span>
    </Alert>
  );
}

function CancelPanel({ booking: b, token, onDone, onCancel }: { booking: ManagedBooking; token: string; onDone: (r: CancellationResult) => void; onCancel: () => void }) {
  const cancel = useCancelBooking(token);
  const settled = b.gift_card_applied_cents + b.paid_cents;
  const explanation =
    b.cancel_outcome_if_now === 'full_refund'
      ? settled > 0
        ? `Annulation sans frais : les ${formatPrice(settled)} déjà réglés vous seront restitués.`
        : 'Annulation sans frais.'
      : b.cancel_outcome_if_now === 'credit'
        ? b.paid_cents > 0
          ? `Un avoir de ${formatPrice(b.paid_cents)} vous sera attribué sous forme de bon cadeau.`
          : b.gift_card_applied_cents > 0
            ? 'Le montant réglé par bon cadeau sera recrédité sur votre bon.'
            : 'Annulation sans frais.'
        : '';

  return (
    <section aria-labelledby="annulation-title" className="flex flex-col gap-4 border-l-4 border-race-600 bg-asphalt-900 p-5 sm:p-6">
      <h2 id="annulation-title" className="font-display text-lg font-bold uppercase">
        Annuler la réservation {b.reference} ?
      </h2>
      <p className="text-asphalt-200">{explanation}</p>
      {cancel.isError && <Alert tone="error">{errorMessage(cancel.error)}</Alert>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={cancel.isPending}>
          Garder ma réservation
        </Button>
        <Button onClick={() => cancel.mutate(undefined, { onSuccess: onDone })} disabled={cancel.isPending}>
          {cancel.isPending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          Confirmer l'annulation
        </Button>
      </div>
    </section>
  );
}

function ReschedulePanel({
  booking: b,
  token,
  catalogPack,
  horizonDays,
  onDone,
  onCancel,
}: {
  booking: ManagedBooking;
  token: string;
  catalogPack: { sessions_count: number; min_gap_min: number } | null;
  horizonDays: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const reschedule = useRescheduleBooking(token);
  const required = catalogPack?.sessions_count ?? 1;

  const toggle = (slot: AvailabilitySlot, slotDay: string) => {
    if (slotDay !== day) {
      setDay(slotDay);
      setSelected([slot]);
      return;
    }
    setSelected((current) => {
      if (current.some((s) => s.slot_id === slot.slot_id)) return current.filter((s) => s.slot_id !== slot.slot_id);
      const next = required === 1 ? [slot] : [...current, slot].slice(-required);
      return next.sort((a, c) => a.starts_at.localeCompare(c.starts_at));
    });
  };

  const confirmNewSlots = async () => {
    if (!b.product) return;
    setError(null);
    setHolding(true);
    let holdToken: string | null = null;
    try {
      const hold = await createHold(b.product.id, selected.map((s) => s.slot_id), b.karts);
      holdToken = hold.hold_token;
      await reschedule.mutateAsync(hold.hold_token);
      onDone();
    } catch (raw) {
      if (holdToken) void releaseHold(holdToken);
      setError(RpcError.from(raw).message);
    } finally {
      setHolding(false);
    }
  };

  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-5 bg-asphalt-900 p-5 ring-1 ring-asphalt-800 sm:p-6">
      <h2 id="report-title" className="font-display text-lg font-bold uppercase">
        Choisir un nouveau créneau
      </h2>
      {error && <Alert tone="error">{error}</Alert>}
      {b.product && (
        <SlotPicker
          productId={b.product.id}
          karts={b.karts}
          horizonDays={horizonDays}
          day={day}
          selected={selected}
          required={required}
          minGapMin={catalogPack?.min_gap_min ?? 0}
          onSelectDay={(d) => {
            setDay(d);
            setSelected([]);
          }}
          onToggleSlot={toggle}
        />
      )}
      <div className={cx('flex flex-col-reverse gap-3 sm:flex-row sm:justify-end')}>
        <Button variant="ghost" onClick={onCancel} disabled={holding}>
          Annuler
        </Button>
        <Button onClick={confirmNewSlots} disabled={selected.length !== required || holding}>
          {holding ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <CircleCheck aria-hidden className="size-4" />}
          Confirmer le nouvel horaire
        </Button>
      </div>
    </section>
  );
}
