import { CalendarClock, Check, CircleSlash, ExternalLink, FileSignature, HandCoins, Save, UserCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { formatDay, formatPrice, formatTime, isoToParisDay } from '@/lib/format';
import {
  useBookingNote,
  useCancelBookingAdmin,
  useCheckIn,
  useSetBookingStatus,
  useSignWaiver,
} from '../api';
import {
  AUDIT_ACTION,
  BOOKING_SOURCE,
  BOOKING_STATUS,
  CANCEL_OUTCOME,
  CANCELLATION_RESULT,
  formatDateTime,
  PAYMENT_METHOD,
} from '../labels';
import { useStaffMember } from '../role-context';
import type { AdminBooking, CancelOutcome } from '../types';
import { useNow } from '../hooks';
import { useToast } from '../toast-context';
import { Check as CheckBox, ConfirmDialog, DefinitionList, Input, Select, SmallButton, StatusChip, Textarea } from '../ui';
import { PaymentDialog } from './PaymentDialog';
import { ParticipantForm } from './ParticipantForm';

const ACTIVE = ['pending', 'confirmed', 'checked_in', 'reschedule_required'];

/** Âge révolu à une date */
function ageAt(birth: string, day: string): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function BookingDetails({ booking, compact = false }: { booking: AdminBooking; compact?: boolean }) {
  const { isOwner } = useStaffMember();
  const toast = useToast();
  const checkIn = useCheckIn();
  const setStatus = useSetBookingStatus();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<'payment' | 'refund' | null>(null);
  const [waiverFor, setWaiverFor] = useState<AdminBooking['participants'][number] | null>(null);
  const [statusAsk, setStatusAsk] = useState<'no_show' | 'completed' | null>(null);

  const active = ACTIVE.includes(booking.status);
  const day = isoToParisDay(booking.starts_at);
  const now = useNow();
  const isFuture = new Date(booking.starts_at).getTime() > now;
  const canCheckIn = ['pending', 'confirmed', 'checked_in'].includes(booking.status);
  const refundDue = booking.cancellation_outcome === 'refund_due';

  const doCheckIn = (participantIds: string[] | null) =>
    checkIn.mutate(
      { id: booking.id, participantIds },
      {
        onSuccess: () => toast.success(participantIds ? 'Arrivée enregistrée.' : `Tout le groupe ${booking.reference} est enregistré.`),
        onError: toast.error,
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={BOOKING_STATUS[booking.status]} />
        <Chip tone="outline">{BOOKING_SOURCE[booking.source]}</Chip>
        {booking.cancellation_outcome && <Chip tone={refundDue ? 'red' : 'outline'}>{CANCELLATION_RESULT[booking.cancellation_outcome]}</Chip>}
        {booking.is_today === false && <Chip tone="yellow">Pas prévue aujourd’hui</Chip>}
      </div>

      <DefinitionList
        items={[
          ['Activité', booking.product?.name ?? booking.event?.title ?? '—'],
          ['Date', `${formatDay(day)} · ${formatTime(booking.starts_at)}`],
          booking.sessions.length > 0 && [
            'Sessions',
            <ul key="s" className="flex flex-col">
              {booking.sessions.map((s) => (
                <li key={s.slot_id}>
                  {formatTime(s.starts_at)}–{formatTime(s.ends_at)} · {s.track} · {s.karts} kart{s.karts > 1 ? 's' : ''}
                </li>
              ))}
            </ul>,
          ],
          ['Client', <CustomerCell key="c" booking={booking} />],
          ['Karts / pilotes', `${booking.karts} kart(s) · ${booking.participants_count} participant(s)`],
          booking.customer_note && ['Message du client', <span key="n" className="whitespace-pre-wrap">{booking.customer_note}</span>],
          booking.cancel_reason && ['Motif d’annulation', booking.cancel_reason],
          ['Créée le', formatDateTime(booking.created_at)],
        ]}
      />

      {/* Montants */}
      <section aria-labelledby="money-title" className="flex flex-col gap-3 bg-asphalt-950 p-4 ring-1 ring-asphalt-800">
        <h3 id="money-title" className="font-display text-lg font-bold uppercase">
          Règlement
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <MoneyItem label="Total" value={booking.total_cents} />
          <MoneyItem label="Bon cadeau" value={-booking.gift_card_applied_cents} />
          <MoneyItem label="Encaissé" value={booking.paid_cents} />
          <MoneyItem label="Reste dû" value={booking.amount_due_cents} strong />
        </dl>
        {booking.payments.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-asphalt-300">
            {booking.payments.map((p) => (
              <li key={p.id}>
                {formatDateTime(p.paid_at)} · {p.kind === 'refund' ? 'Remboursement' : 'Encaissement'} {formatPrice(p.amount_cents)} ·{' '}
                {PAYMENT_METHOD[p.method]}
                {p.recorded_by ? ` · ${p.recorded_by}` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </li>
            ))}
          </ul>
        )}
        {booking.gift_card_transactions.length > 0 && (
          <p className="text-xs text-asphalt-300">
            Bons : {booking.gift_card_transactions.map((t) => `${t.code} (${formatPrice(Math.abs(t.amount_cents))})`).join(', ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {booking.amount_due_cents > 0 && booking.status !== 'cancelled' && (
            <SmallButton variant="primary" onClick={() => setPayOpen('payment')}>
              <HandCoins aria-hidden />
              Encaisser {formatPrice(booking.amount_due_cents)}
            </SmallButton>
          )}
          {booking.amount_due_cents === 0 && booking.status !== 'cancelled' && booking.total_cents > 0 && <Chip tone="green">Réglée</Chip>}
          {refundDue && isOwner && (
            <SmallButton variant="danger" onClick={() => setPayOpen('refund')}>
              Rembourser {formatPrice(booking.paid_cents)}
            </SmallButton>
          )}
          {refundDue && !isOwner && <p className="text-xs text-race-400">Remboursement à effectuer par le dirigeant.</p>}
        </div>
      </section>

      {/* Participants */}
      <section aria-labelledby="participants-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="participants-title" className="font-display text-lg font-bold uppercase">
            Participants
          </h3>
          {canCheckIn && booking.participants.some((p) => !p.checked_in) && (
            <SmallButton variant="primary" busy={checkIn.isPending} onClick={() => doCheckIn(null)}>
              <UserCheck aria-hidden />
              Tout le groupe est arrivé
            </SmallButton>
          )}
          {canCheckIn && booking.participants.length === 0 && booking.status !== 'checked_in' && (
            <SmallButton variant="primary" busy={checkIn.isPending} onClick={() => doCheckIn(null)}>
              <UserCheck aria-hidden />
              Enregistrer l’arrivée
            </SmallButton>
          )}
        </div>
        {booking.participants.length === 0 ? (
          <p className="text-sm text-asphalt-400">Participants non renseignés (réservation téléphone) : à compléter au comptoir.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-asphalt-800 ring-1 ring-asphalt-800">
            {booking.participants.map((p) => {
              const age = ageAt(p.birth_date, day);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-chalk">
                      {p.first_name} {p.last_name}
                      {p.role === 'passenger' && <span className="font-normal text-asphalt-400"> · passager</span>}
                    </p>
                    <p className="text-xs text-asphalt-400">
                      {age} ans{p.height_cm ? ` · ${p.height_cm} cm` : p.height_certified ? ' · taille certifiée' : ''}
                      {p.waiver_signed_by ? ` · décharge : ${p.waiver_signed_by}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.waiver_signed ? (
                      <Chip tone="green" icon={<FileSignature />}>
                        Décharge
                      </Chip>
                    ) : (
                      <SmallButton onClick={() => setWaiverFor(p)}>
                        <FileSignature aria-hidden />
                        Signer la décharge
                      </SmallButton>
                    )}
                    {p.checked_in ? (
                      <Chip tone="green" icon={<Check />}>
                        Arrivé
                      </Chip>
                    ) : (
                      canCheckIn && (
                        <SmallButton onClick={() => doCheckIn([p.id])} disabled={checkIn.isPending}>
                          Arrivé
                        </SmallButton>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {active && <ParticipantForm bookingId={booking.id} />}
      </section>

      {!compact && <InternalNote booking={booking} />}

      {/* Actions */}
      <section aria-label="Actions" className="flex flex-wrap gap-2 border-t border-asphalt-800 pt-4">
        {booking.product && active && (
          <Link
            to={`/admin/planning?jour=${day}&vue=jour`}
            className="inline-flex h-9 items-center gap-1.5 bg-asphalt-800 px-3 text-sm font-semibold text-chalk ring-1 ring-asphalt-600 hover:bg-asphalt-700"
          >
            <CalendarClock aria-hidden className="size-4" />
            Déplacer depuis le planning
          </Link>
        )}
        {active && booking.status !== 'checked_in' && (
          <SmallButton variant="danger" onClick={() => setCancelOpen(true)}>
            <XCircle aria-hidden />
            Annuler la réservation
          </SmallButton>
        )}
        {booking.status === 'checked_in' && (
          <SmallButton onClick={() => setStatusAsk('completed')}>
            <Check aria-hidden />
            Marquer terminée
          </SmallButton>
        )}
        {['pending', 'confirmed'].includes(booking.status) && !isFuture && (
          <SmallButton onClick={() => setStatusAsk('no_show')}>
            <CircleSlash aria-hidden />
            Client absent
          </SmallButton>
        )}
        <Link
          to={`/reservation/${booking.qr_token}`}
          target="_blank"
          className="inline-flex h-9 items-center gap-1.5 px-3 text-sm text-asphalt-300 hover:text-chalk"
        >
          <ExternalLink aria-hidden className="size-4" />
          Page client
        </Link>
      </section>

      {!compact && booking.history.length > 0 && (
        <section aria-labelledby="history-title" className="flex flex-col gap-2">
          <h3 id="history-title" className="font-display text-lg font-bold uppercase">
            Historique
          </h3>
          <ol className="flex flex-col gap-1 text-xs text-asphalt-300">
            {booking.history.map((h, i) => (
              <li key={i}>
                {formatDateTime(h.created_at)} · {AUDIT_ACTION[h.action] ?? h.action} · {h.actor}
              </li>
            ))}
          </ol>
        </section>
      )}

      <CancelDialog booking={booking} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <PaymentDialog
        open={payOpen !== null}
        kind={payOpen ?? 'payment'}
        defaultCents={payOpen === 'refund' ? booking.paid_cents : booking.amount_due_cents}
        target={{ booking_id: booking.id }}
        title={payOpen === 'refund' ? `Rembourser ${booking.reference}` : `Encaisser ${booking.reference}`}
        onClose={() => setPayOpen(null)}
      />
      <WaiverDialog participant={waiverFor} day={day} onClose={() => setWaiverFor(null)} />
      <ConfirmDialog
        open={statusAsk !== null}
        title={statusAsk === 'no_show' ? 'Client absent ?' : 'Réservation terminée ?'}
        confirmLabel="Confirmer"
        busy={setStatus.isPending}
        onClose={() => setStatusAsk(null)}
        onConfirm={() =>
          statusAsk &&
          setStatus.mutate(
            { id: booking.id, status: statusAsk },
            {
              onSuccess: () => {
                toast.success('Statut mis à jour.');
                setStatusAsk(null);
              },
              onError: toast.error,
            },
          )
        }
      >
        {statusAsk === 'no_show'
          ? 'La réservation passe en « absent » : aucune restitution n’est due.'
          : 'La réservation est clôturée.'}
      </ConfirmDialog>
    </div>
  );
}

function CustomerCell({ booking }: { booking: AdminBooking }) {
  const c = booking.customer;
  return (
    <span className="flex flex-col">
      <Link to={`/admin/clients?fiche=${booking.customer_id}`} className="font-semibold text-chalk underline-offset-2 hover:underline">
        {c.first_name} {c.last_name}
      </Link>
      {c.phone && (
        <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="text-asphalt-300 hover:text-chalk">
          {c.phone}
        </a>
      )}
      {c.email && (
        <a href={`mailto:${c.email}`} className="break-all text-asphalt-300 hover:text-chalk">
          {c.email}
        </a>
      )}
      {booking.chrono_validated && <span className="text-xs text-flag-green">Validation chrono acquise</span>}
    </span>
  );
}

function MoneyItem({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-asphalt-400">{label}</dt>
      <dd className={strong ? 'text-lg font-bold tabular text-chalk' : 'tabular text-asphalt-200'}>
        {value < 0 ? `− ${formatPrice(-value)}` : formatPrice(Math.abs(value))}
      </dd>
    </div>
  );
}

function InternalNote({ booking }: { booking: AdminBooking }) {
  const toast = useToast();
  const save = useBookingNote();
  const [note, setNote] = useState(booking.internal_note);
  const dirty = note !== booking.internal_note;
  return (
    <div className="flex flex-col gap-2">
      <Textarea label="Note interne (invisible du client)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      {dirty && (
        <SmallButton
          className="self-start"
          busy={save.isPending}
          onClick={() => save.mutate({ id: booking.id, note }, { onSuccess: () => toast.success('Note enregistrée.'), onError: toast.error })}
        >
          <Save aria-hidden />
          Enregistrer la note
        </SmallButton>
      )}
    </div>
  );
}

function CancelDialog({ booking, open, onClose }: { booking: AdminBooking; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const cancel = useCancelBookingAdmin();
  const [outcome, setOutcome] = useState<CancelOutcome>('full_refund');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      title={`Annuler ${booking.reference}`}
      confirmLabel="Annuler la réservation"
      danger
      busy={cancel.isPending}
      onClose={onClose}
      onConfirm={() =>
        cancel.mutate(
          { id: booking.id, outcome, reason: reason.trim() || 'Annulation par le circuit', notify },
          {
            onSuccess: (result) => {
              toast.success(
                result.outcome === 'refund_due'
                  ? `Réservation annulée : ${formatPrice(result.paid_cents)} à rembourser.`
                  : result.credit_code
                    ? `Réservation annulée : avoir ${result.credit_code} émis.`
                    : 'Réservation annulée.',
              );
              onClose();
            },
            onError: toast.error,
          },
        )
      }
    >
      <Select label="Restitution" value={outcome} onChange={(e) => setOutcome(e.target.value as CancelOutcome)}>
        {(Object.keys(CANCEL_OUTCOME) as CancelOutcome[]).map((key) => (
          <option key={key} value={key}>
            {CANCEL_OUTCOME[key].label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-asphalt-400">{CANCEL_OUTCOME[outcome].hint}</p>
      <Input label="Motif (envoyé au client)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. météo, piste fermée…" maxLength={300} />
      <CheckBox label="Prévenir le client par email" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
    </ConfirmDialog>
  );
}

function WaiverDialog({ participant, day, onClose }: { participant: AdminBooking['participants'][number] | null; day: string; onClose: () => void }) {
  const toast = useToast();
  const sign = useSignWaiver();
  const minor = participant ? ageAt(participant.birth_date, day) < 18 : false;
  const [signer, setSigner] = useState('');
  const defaultSigner = participant && !minor ? `${participant.first_name} ${participant.last_name}` : '';
  const value = signer || defaultSigner;
  return (
    <ConfirmDialog
      open={!!participant}
      title="Décharge signée au comptoir"
      confirmLabel="Enregistrer la signature"
      busy={sign.isPending}
      onClose={() => {
        setSigner('');
        onClose();
      }}
      onConfirm={() =>
        participant &&
        sign.mutate(
          { participantId: participant.id, signedBy: value },
          {
            onSuccess: () => {
              toast.success('Décharge enregistrée.');
              setSigner('');
              onClose();
            },
            onError: toast.error,
          },
        )
      }
    >
      <p>
        {participant?.first_name} {participant?.last_name} a signé la décharge papier en vigueur.
        {minor && ' Participant mineur : indiquez le représentant légal qui a signé.'}
      </p>
      <Input label={minor ? 'Représentant légal (nom et prénom)' : 'Signataire'} value={value} onChange={(e) => setSigner(e.target.value)} required />
    </ConfirmDialog>
  );
}
