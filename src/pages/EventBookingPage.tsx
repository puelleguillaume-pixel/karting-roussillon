import { CalendarDays, Check, LoaderCircle, MapPin, Users } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { GiftCodeField } from '@/components/booking/GiftCodeField';
import { CountStepper } from '@/components/booking/parts';
import { ParticipantFields } from '@/components/booking/ParticipantFields';
import { Seo } from '@/components/Seo';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/fields';
import { Container, Eyebrow, Kerb } from '@/components/ui/layout';
import { EMPTY_PARTICIPANT, pilotKey, validateParticipant, type ParticipantDraft } from '@/lib/booking-rules';
import { useBookEvent, usePublicEvent } from '@/lib/booking-queries';
import { EVENT_KIND_LABELS } from '@/lib/catalog';
import { errorMessage } from '@/lib/data/errors';
import type { CustomerInput, PublicEvent } from '@/lib/data/types';
import { capitalize, formatDay, formatLength, formatPrice, formatTime, isoToParisDay, pluralize } from '@/lib/format';
import { trackConversion } from '@/lib/analytics';
import { forgetPendingGiftCode, pendingGiftCode } from '@/lib/giftcards';
import { useBundle } from '@/lib/queries';

interface Rider extends ParticipantDraft {
  vehicle: string;
  licence: string;
}

const EMPTY_RIDER: Rider = { ...EMPTY_PARTICIPANT, vehicle: '', licence: '' };
const EMPTY_CONTACT: CustomerInput = { first_name: '', last_name: '', email: '', phone: '' };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function EventBookingPage() {
  const { slug } = useParams();
  const event = usePublicEvent(slug);

  if (event.isPending) {
    return (
      <Container className="flex flex-col gap-4 py-16">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-72 w-full" />
      </Container>
    );
  }
  if (event.isError) {
    return (
      <Container className="py-16">
        <ErrorPanel message={errorMessage(event.error)} onRetry={() => event.refetch()} />
      </Container>
    );
  }
  if (!event.data) {
    return (
      <Container className="flex flex-col items-start gap-5 py-16">
        <Seo title="Événement introuvable · Karting Roussillon" noIndex />
        <h1 className="text-display-lg font-extrabold uppercase">Événement introuvable</h1>
        <ButtonLink to="/trackday">Voir le calendrier</ButtonLink>
      </Container>
    );
  }
  return <EventBooking event={event.data} />;
}

function EventBooking({ event }: { event: PublicEvent }) {
  const bundle = useBundle();
  const navigate = useNavigate();
  const book = useBookEvent();
  const formRef = useRef<HTMLFormElement>(null);
  const [contact, setContact] = useState<CustomerInput>(EMPTY_CONTACT);
  const [riders, setRiders] = useState<Rider[]>([{ ...EMPTY_RIDER }]);
  const [note, setNote] = useState('');
  const [giftCode, setGiftCode] = useState(pendingGiftCode);
  const [giftApplied, setGiftApplied] = useState(0);
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const day = isoToParisDay(event.starts_at);
  const maxRiders = Math.max(1, Math.min(event.places_left, Number(bundle.settings.max_karts_per_booking ?? 10)));
  const bookable = event.is_bookable && event.places_left > 0;

  const total = (event.price_cents ?? 0) * riders.length;
  const setCount = (count: number) => {
    setRiders((current) => Array.from({ length: count }, (_, i) => current[i] ?? { ...EMPTY_RIDER }));
    setGiftApplied(0); // le montant imputable dépend du total
  };
  const updateRider = (index: number, patch: Partial<Rider>) => setRiders((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const validate = () => {
    const found: Record<string, string> = {};
    if (!contact.first_name.trim()) found['contact.first_name'] = 'Indiquez votre prénom.';
    if (!contact.last_name.trim()) found['contact.last_name'] = 'Indiquez votre nom.';
    if (!EMAIL.test(contact.email.trim())) found['contact.email'] = 'Indiquez une adresse email valide.';
    if (contact.phone.replace(/\D/g, '').length < 10) found['contact.phone'] = 'Indiquez un numéro de téléphone à 10 chiffres.';
    const seen = new Set<string>();
    riders.forEach((rider, i) => {
      const who = riders.length > 1 ? `Le pilote ${i + 1}` : 'Le pilote';
      for (const [field, message] of Object.entries(validateParticipant(rider, { day, minAge: 0, minHeight: null }, who))) {
        found[`rider.${i}.${field}`] = message;
      }
      if (event.requires_own_vehicle && !rider.vehicle.trim()) found[`rider.${i}.vehicle`] = 'Indiquez le véhicule (marque et modèle).';
      if (rider.first_name && rider.last_name && rider.birth_date) {
        const key = pilotKey(rider);
        if (seen.has(key)) found[`rider.${i}.first_name`] = 'Ce pilote est déjà saisi.';
        seen.add(key);
      }
    });
    if (!waiver) found.waiver = 'Acceptez la décharge de responsabilité pour continuer.';
    if (!terms) found.terms = 'Acceptez les conditions générales de vente pour continuer.';
    return found;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    book.mutate(
      {
        eventId: event.id,
        customer: { first_name: contact.first_name.trim(), last_name: contact.last_name.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
        participants: riders.map((r) => ({
          role: 'driver',
          first_name: r.first_name.trim(),
          last_name: r.last_name.trim(),
          birth_date: r.birth_date,
          guardian_name: r.guardian_name.trim(),
          extra: { vehicle: r.vehicle.trim(), licence: r.licence.trim() },
        })),
        note: note.trim(),
        giftCardCode: giftApplied > 0 ? giftCode : null,
      },
      {
        onSuccess: (result) => {
          trackConversion('event', { valueCents: result.total_cents, transactionId: result.reference });
          forgetPendingGiftCode();
          navigate(`/reservation/${result.qr_token}?confirmee=1`, { replace: true });
        },
      },
    );
  };

  return (
    <>
      <Seo title={`${event.title} · Karting Roussillon`} description={event.description || undefined} />
      <header className="relative border-b border-asphalt-800">
        <Container className="flex flex-col gap-5 py-10 sm:py-14">
          <Eyebrow>{EVENT_KIND_LABELS[event.kind] ?? 'Événement'}</Eyebrow>
          <h1 className="text-display-xl font-extrabold uppercase">{event.title}</h1>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-asphalt-200">
            <li className="flex items-center gap-2">
              <CalendarDays aria-hidden className="size-4 text-race-400" />
              {capitalize(formatDay(day))} · {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
            </li>
            {event.tracks.map((track) => (
              <li key={track.slug} className="flex items-center gap-2">
                <MapPin aria-hidden className="size-4 text-race-400" />
                {track.name}
                {track.length_m ? ` · ${formatLength(track.length_m)}` : ''}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <Users aria-hidden className="size-4 text-race-400" />
              {event.places_left > 0 ? pluralize(event.places_left, 'place restante', 'places restantes') : 'Complet'}
            </li>
          </ul>
          {event.price_cents !== null && (
            <p className="font-display text-4xl font-extrabold tabular">
              {formatPrice(event.price_cents)} <span className="text-lg font-semibold text-asphalt-400">par pilote</span>
            </p>
          )}
          {event.description && <p className="max-w-[62ch] text-asphalt-300">{event.description}</p>}
        </Container>
        <Kerb className="absolute inset-x-0 bottom-0" />
      </header>

      <Container className="py-10">
        {!bookable ? (
          <div className="flex flex-col items-start gap-4">
            <Alert tone="info" title={event.places_left > 0 ? 'Inscriptions fermées' : 'Complet'}>
              Les inscriptions en ligne ne sont pas ouvertes pour cet événement. Contactez le circuit pour vous renseigner.
            </Alert>
            <ButtonLink to="/trackday" variant="secondary">
              Voir le calendrier
            </ButtonLink>
          </div>
        ) : (
          <form ref={formRef} noValidate onSubmit={submit} className="mx-auto flex max-w-3xl flex-col gap-6">
            {book.isError && <Alert tone="error" title="Inscription impossible">{errorMessage(book.error)}</Alert>}
            <CountStepper label="Nombre de pilotes" hint={`${maxRiders} maximum`} value={riders.length} max={maxRiders} onChange={setCount} />

            <fieldset className="bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
              <legend className="float-left mb-4 w-full font-display text-lg font-bold uppercase">Vos coordonnées</legend>
              <div className="clear-left grid gap-4 sm:grid-cols-2">
                <TextField label="Prénom" name="contact.first_name" autoComplete="given-name" required value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} error={errors['contact.first_name']} />
                <TextField label="Nom" name="contact.last_name" autoComplete="family-name" required value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} error={errors['contact.last_name']} />
                <TextField label="Email" name="contact.email" type="email" autoComplete="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} error={errors['contact.email']} />
                <TextField label="Téléphone" name="contact.phone" type="tel" autoComplete="tel" required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} error={errors['contact.phone']} />
              </div>
            </fieldset>

            {riders.map((rider, index) => (
              <ParticipantFields
                key={index}
                name={`rider.${index}`}
                legend={riders.length > 1 ? `Pilote ${index + 1}` : 'Pilote'}
                value={rider}
                errors={errors}
                day={day}
                minHeight={null}
                onChange={(patch) => updateRider(index, patch)}
              >
                <TextField
                  label="Véhicule (marque et modèle)"
                  name={`rider.${index}.vehicle`}
                  required={event.requires_own_vehicle}
                  value={rider.vehicle}
                  onChange={(e) => updateRider(index, { vehicle: e.target.value })}
                  error={errors[`rider.${index}.vehicle`]}
                />
                <TextField label="N° de licence" name={`rider.${index}.licence`} value={rider.licence} onChange={(e) => updateRider(index, { licence: e.target.value })} />
              </ParticipantFields>
            ))}

            <GiftCodeField
              code={giftCode}
              onCodeChange={setGiftCode}
              totalCents={total}
              productId={null}
              appliedCents={giftApplied}
              onApplied={setGiftApplied}
            />

            <TextAreaField label="Message pour le circuit" name="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />

            <div className="flex flex-col gap-3 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
              <CheckboxField name="waiver" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} error={errors.waiver} label="J'accepte la décharge de responsabilité pour les pilotes inscrits (représentant légal pour les mineurs)." />
              <CheckboxField
                name="terms"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                error={errors.terms}
                label={
                  <>
                    J'accepte les{' '}
                    <Link to="/cgv" target="_blank" className="text-race-400 underline underline-offset-2">
                      conditions générales de vente
                    </Link>
                    .
                  </>
                }
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-asphalt-200">
                {giftApplied > 0 ? 'À régler sur place' : 'Total'} :{' '}
                <strong className="font-display text-2xl text-chalk">{formatPrice(Math.max(total - giftApplied, 0))}</strong>
                <span className="block text-sm text-asphalt-400">
                  {giftApplied > 0 ? `Total ${formatPrice(total)}, dont ${formatPrice(giftApplied)} par bon cadeau. ` : ''}
                  Réglé sur place le jour de l'événement.
                </span>
              </p>
              <Button type="submit" size="lg" disabled={book.isPending}>
                {book.isPending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
                Confirmer l'inscription
              </Button>
            </div>
          </form>
        )}
      </Container>
    </>
  );
}
