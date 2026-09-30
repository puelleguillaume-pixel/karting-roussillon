import { ArrowRight, Download, Gift, LoaderCircle, LogOut, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/domain/blocks';
import { Seo } from '@/components/Seo';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Alert, EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/fields';
import { Section } from '@/components/ui/layout';
import { useAuth } from '@/lib/auth-context';
import { useMyBookings, useMyGiftCards, useMyProfile } from '@/lib/booking-queries';
import { errorMessage } from '@/lib/data/errors';
import { contactContent } from '@/lib/catalog';
import type { BookingDetails, MyGiftCard } from '@/lib/data/types';
import { env } from '@/lib/env';
import { capitalize, formatDay, formatPrice, formatTime, isoToParisDay } from '@/lib/format';
import { downloadGiftCardPdf } from '@/lib/giftcard-pdf';
import { useBundle } from '@/lib/queries';

const ACTIVE = new Set(['pending', 'confirmed', 'reschedule_required']);
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  checked_in: 'Présent',
  completed: 'Terminée',
  cancelled: 'Annulée',
  no_show: 'Absent',
  reschedule_required: 'À reporter',
};

export default function AccountPage() {
  const { user, ready } = useAuth();
  return (
    <>
      <Seo title="Mon compte · Karting Roussillon" noIndex />
      <PageHeader eyebrow="Espace client" title="Mon compte" intro={user ? `Connecté avec ${user.email}` : 'Retrouvez vos réservations et vos bons cadeaux.'} />
      <Section>{!ready ? <Skeleton className="h-40 w-full max-w-xl" /> : user ? <Dashboard /> : <LoginPanel />}</Section>
    </>
  );
}

function LoginPanel() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Indiquez une adresse email valide.');
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const { mode } = await signIn(email.trim());
      if (mode === 'magic_link') setSentTo(email.trim());
    } catch (raw) {
      setError(errorMessage(raw));
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <Alert tone="success" title="Vérifiez votre boîte mail" className="max-w-xl">
        Un lien de connexion vient d'être envoyé à <strong className="text-chalk">{sentTo}</strong>. Il est valable une heure.
      </Alert>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex max-w-xl flex-col gap-5 bg-asphalt-900 p-6 ring-1 ring-asphalt-800 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">Connexion sans mot de passe</h2>
        <p className="text-asphalt-300">Indiquez l'email utilisé lors de vos réservations : vous recevrez un lien de connexion.</p>
      </div>
      {env.dataSource === 'demo' && (
        <Alert tone="info" title="Démonstration">
          La connexion est simulée : aucun email n'est envoyé. Utilisez l'adresse d'une réservation faite dans la démo.
        </Alert>
      )}
      <TextField label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <MailCheck aria-hidden className="size-4" />}
        {env.dataSource === 'demo' ? 'Me connecter' : 'Recevoir le lien'}
      </Button>
    </form>
  );
}

function BookingRow({ booking }: { booking: BookingDetails }) {
  const day = isoToParisDay(booking.event?.starts_at ?? booking.starts_at);
  return (
    <li>
      <Link
        to={`/reservation/${booking.qr_token}`}
        className="group flex items-center gap-4 bg-asphalt-900 p-4 ring-1 ring-asphalt-800 transition-colors hover:ring-race-500"
      >
        <span className="flex w-16 shrink-0 flex-col items-center bg-asphalt-950 py-2 ring-1 ring-asphalt-800">
          <span className="font-display text-2xl font-extrabold leading-none tabular">{formatDay(day, { day: '2-digit' })}</span>
          <span className="font-display text-xs font-semibold uppercase text-race-400">{formatDay(day, { month: 'short' }).replace('.', '')}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-lg font-bold uppercase leading-tight">{booking.product?.name ?? booking.event?.title}</span>
          <span className="text-sm text-asphalt-400">
            {capitalize(formatDay(day))} · {formatTime(booking.event?.starts_at ?? booking.starts_at)} · {booking.reference}
          </span>
        </span>
        <Chip tone={ACTIVE.has(booking.status) ? 'green' : 'outline'}>{STATUS_LABELS[booking.status] ?? booking.status}</Chip>
        <ArrowRight aria-hidden className="hidden size-5 shrink-0 text-race-400 transition-transform group-hover:translate-x-1 sm:block" />
      </Link>
    </li>
  );
}

const GIFT_STATUS: Record<MyGiftCard['status'], { label: string; tone: 'yellow' | 'green' | 'neutral' | 'red' | 'outline' }> = {
  pending_payment: { label: 'En attente de règlement', tone: 'yellow' },
  active: { label: 'Actif', tone: 'green' },
  exhausted: { label: 'Utilisé', tone: 'outline' },
  expired: { label: 'Expiré', tone: 'red' },
  disabled: { label: 'Désactivé', tone: 'outline' },
};

function GiftCardRow({ card, fromName }: { card: MyGiftCard; fromName: string }) {
  const bundle = useBundle();
  const contact = contactContent(bundle);
  const [downloading, setDownloading] = useState(false);
  const status = GIFT_STATUS[card.status];
  const value = card.product ?? formatPrice(card.initial_amount_cents);

  const download = async () => {
    if (!card.code || !contact) return;
    setDownloading(true);
    try {
      await downloadGiftCardPdf(
        {
          code: card.code,
          kind: card.kind,
          amountCents: card.initial_amount_cents,
          productName: card.product,
          recipientName: card.recipient_name,
          fromName,
          message: card.message,
          expiresAt: card.expires_at,
        },
        { name: contact.title, address: contact.data.address, postalCode: contact.data.postal_code, city: contact.data.city, phone: contact.data.phone },
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.08em]">
          <Gift aria-hidden className="size-5 shrink-0 text-race-400" />
          {card.code ?? `Commande ${card.order_reference ?? ''}`}
        </p>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <p className="text-asphalt-200">
        {value}
        {card.recipient_name ? ` · pour ${card.recipient_name}` : ''}
      </p>
      {card.status === 'pending_payment' ? (
        <p className="text-sm text-asphalt-400">Réglez-le à l'accueil ou par téléphone : le bon vous est envoyé par email dès le règlement.</p>
      ) : (
        <>
          <p className="text-sm text-asphalt-300">
            Solde <strong className="text-chalk">{formatPrice(card.balance_cents)}</strong> sur {formatPrice(card.initial_amount_cents)}
            {card.expires_at && ` · valable jusqu'au ${formatDay(isoToParisDay(card.expires_at), { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </p>
          {card.status === 'active' && (
            <Button variant="secondary" size="sm" onClick={download} disabled={downloading} className="self-start">
              {downloading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
              Télécharger le PDF
            </Button>
          )}
        </>
      )}
    </li>
  );
}

function Dashboard() {
  const { user, signOut } = useAuth();
  const profile = useMyProfile();
  const bookings = useMyBookings();
  const giftCards = useMyGiftCards();
  const now = new Date().toISOString();
  const upcoming = (bookings.data ?? []).filter((b) => ACTIVE.has(b.status) && (b.event?.ends_at ?? b.starts_at) >= now).reverse();
  const past = (bookings.data ?? []).filter((b) => !upcoming.includes(b));

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg">
          Bonjour <strong className="font-semibold">{profile.data?.first_name || user?.email}</strong>
        </p>
        <div className="flex gap-2">
          <ButtonLink to="/reserver" size="sm">
            Nouvelle réservation
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut aria-hidden className="size-4" />
            Se déconnecter
          </Button>
        </div>
      </div>

      <section aria-labelledby="a-venir" className="flex flex-col gap-4">
        <h2 id="a-venir" className="font-display text-2xl font-bold uppercase">
          Réservations à venir
        </h2>
        {bookings.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : bookings.isError ? (
          <ErrorPanel message={errorMessage(bookings.error)} onRetry={() => bookings.refetch()} />
        ) : upcoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune réservation à venir">
            <Link to="/reserver" className="text-race-400 underline underline-offset-2">
              Réserver une session
            </Link>
          </EmptyState>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="historique" className="flex flex-col gap-4">
          <h2 id="historique" className="font-display text-2xl font-bold uppercase">
            Historique
          </h2>
          <ul className="flex flex-col gap-2">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mes-bons" className="flex flex-col gap-4">
        <h2 id="mes-bons" className="font-display text-2xl font-bold uppercase">
          Mes bons cadeaux
        </h2>
        {giftCards.data && giftCards.data.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {giftCards.data.map((card) => (
              <GiftCardRow key={card.code ?? card.order_reference ?? card.initial_amount_cents} card={card} fromName={profile.data?.first_name ?? ''} />
            ))}
          </ul>
        ) : (
          <p className="text-asphalt-400">Aucun bon cadeau acheté avec ce compte.</p>
        )}
      </section>
    </div>
  );
}
