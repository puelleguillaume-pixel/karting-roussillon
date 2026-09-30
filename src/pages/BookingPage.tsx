import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ActivityStep } from '@/components/booking/ActivityStep';
import { ConfirmStep } from '@/components/booking/ConfirmStep';
import { clearStoredFlow, holdMatches, participantErrors, participantsPayload, useBookingFlow, useCountdown, type StepRules } from '@/components/booking/flow';
import { CountStepper, HoldTimer, Stepper } from '@/components/booking/parts';
import { ParticipantsStep } from '@/components/booking/ParticipantsStep';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { BookingSummary } from '@/components/booking/Summary';
import { Seo } from '@/components/Seo';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { Container } from '@/components/ui/layout';
import { createHold, releaseHold, useConfirmBooking } from '@/lib/booking-queries';
import { minAgeOf, minHeightOf, pageContent } from '@/lib/catalog';
import { RpcError } from '@/lib/data/errors';
import { isoToParisDay } from '@/lib/format';
import { trackConversion } from '@/lib/analytics';
import { pendingGiftCode } from '@/lib/giftcards';
import { useBundle, useCatalog } from '@/lib/queries';

// Étape à laquelle renvoyer l'utilisateur selon le refus de la base
const ERROR_STEP: Record<string, number> = {
  KR_HOLD_EXPIRED: 2,
  KR_HOLD_NOT_FOUND: 2,
  KR_SLOT_FULL: 2,
  KR_SLOT_BLOCKED: 2,
  KR_SLOT_UNAVAILABLE: 2,
  KR_SLOT_TOO_SOON: 2,
  KR_PACK_OVERLAP: 2,
  KR_PACK_SAME_DAY: 2,
  KR_AGE_TOO_LOW: 3,
  KR_HEIGHT_TOO_LOW: 3,
  KR_HEIGHT_REQUIRED: 3,
  KR_PASSENGER_AGE_TOO_LOW: 3,
  KR_GUARDIAN_REQUIRED: 3,
  KR_DUPLICATE_PARTICIPANT: 3,
  KR_PILOT_OVERLAP: 3,
  KR_CHRONO_VALIDATION_REQUIRED: 3,
  KR_PARTICIPANT_NAME: 3,
  KR_PARTICIPANT_BIRTHDATE: 3,
  KR_PARTICIPANTS_COUNT: 3,
  KR_CUSTOMER_INCOMPLETE: 3,
  KR_EMAIL_INVALID: 3,
};

function PageTop({ step, onNavigate }: { step: number; onNavigate?: (step: number) => void }) {
  const bundle = useBundle();
  const page = pageContent(bundle, 'reserver');
  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} noIndex={step > 1} />
      <header className="border-b border-asphalt-800 bg-asphalt-950">
        <Container className="flex flex-col gap-6 py-8 sm:py-10">
          <h1 className="text-display-lg font-extrabold uppercase">{page.title}</h1>
          <Stepper current={step} onNavigate={onNavigate} />
        </Container>
      </header>
    </>
  );
}

export default function BookingPage() {
  const [params, setParams] = useSearchParams();
  const catalog = useCatalog();
  const productSlug = params.get('produit');
  // Lien « Réserver avec ce bon » : le code est mémorisé avant que le choix
  // de l'activité ne remplace les paramètres de l'URL
  const [giftCode] = useState(pendingGiftCode);

  if (!productSlug) {
    return (
      <>
        <PageTop step={1} />
        <Container className="flex flex-col gap-6 py-10">
          {giftCode && (
            <Alert tone="success" title={`Bon cadeau ${giftCode}`}>
              Choisissez votre activité et votre créneau : le bon sera appliqué à l'étape Confirmation.
            </Alert>
          )}
          <ActivityStep catalog={catalog} onSelect={(slug) => setParams({ produit: slug, etape: '2' })} />
        </Container>
      </>
    );
  }
  // Nouveau produit = nouveau parcours (état isolé par produit)
  return <BookingFunnel key={productSlug} productSlug={productSlug} />;
}

function BookingFunnel({ productSlug }: { productSlug: string }) {
  const bundle = useBundle();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [state, dispatch] = useBookingFlow(productSlug);
  const [notice, setNotice] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [giftAppliedCents, setGiftAppliedCents] = useState(0);
  const confirm = useConfirmBooking();
  const { remainingMs, expired } = useCountdown(state.hold?.expiresAt);

  const product = catalog.productBySlug.get(productSlug);
  if (!product || !product.is_online_bookable || !product.vehicle_type_id) {
    return (
      <>
        <PageTop step={1} />
        <Container className="flex flex-col items-start gap-4 py-12">
          <Alert tone="error" title="Activité non réservable en ligne">
            Cette activité se réserve sur place ou par téléphone.
          </Alert>
          <ButtonLink to="/reserver" variant="secondary">
            Choisir une autre activité
          </ButtonLink>
        </Container>
      </>
    );
  }

  const vehicle = catalog.vehicleById.get(product.vehicle_type_id)!;
  const required = product.pack?.sessions_count ?? 1;
  const maxKarts = Number(bundle.settings.max_karts_per_booking ?? 10);
  const day = state.slots[0] ? isoToParisDay(state.slots[0].starts_at) : state.day;
  const rules: StepRules = {
    driver: { day: day ?? '', minAge: minAgeOf(product, catalog), minHeight: minHeightOf(product, catalog) },
    passenger:
      vehicle.seats > 1
        ? { day: day ?? '', minAge: vehicle.passenger_min_age ?? 0, minHeight: vehicle.passenger_min_height_cm }
        : null,
  };

  // Étape demandée, ramenée à la dernière étape réellement accessible
  const requested = Math.min(Math.max(Number(params.get('etape') ?? 2) || 2, 2), 4);
  const held = holdMatches(state);
  const participantsOk = held && Object.keys(participantErrors(state, rules)).length === 0;
  const step = requested >= 3 && !held ? 2 : requested === 4 && !participantsOk ? 3 : requested;

  const goTo = (target: number) => {
    setNotice(null);
    if (target === 1) {
      navigate('/reserver');
      return;
    }
    setParams({ produit: productSlug, etape: String(target) });
    window.scrollTo({ top: 0 });
  };

  const holdSlots = async () => {
    setHolding(true);
    setNotice(null);
    try {
      if (state.hold) void releaseHold(state.hold.token);
      const slotIds = state.slots.map((s) => s.slot_id);
      const hold = await createHold(product.id, slotIds, state.karts);
      dispatch({ type: 'setHold', hold: { token: hold.hold_token, expiresAt: hold.expires_at, slotIds, karts: state.karts } });
      return true;
    } catch (error) {
      dispatch({ type: 'setHold', hold: null });
      setNotice(RpcError.from(error).message);
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['available-days'] });
      return false;
    } finally {
      setHolding(false);
    }
  };

  const continueFromSlots = async () => {
    if (held && !expired) {
      goTo(3);
      return;
    }
    if (await holdSlots()) goTo(3);
  };

  const confirmBooking = () => {
    if (!state.hold) return;
    confirm.mutate(
      {
        holdToken: state.hold.token,
        customer: {
          first_name: state.contact.first_name.trim(),
          last_name: state.contact.last_name.trim(),
          email: state.contact.email.trim(),
          phone: state.contact.phone.trim(),
        },
        participants: participantsPayload(state),
        note: state.note.trim(),
        giftCardCode: giftAppliedCents > 0 ? state.giftCode : null,
      },
      {
        onSuccess: (result) => {
          trackConversion('booking', { valueCents: result.total_cents, transactionId: result.reference });
          clearStoredFlow();
          navigate(`/reservation/${result.qr_token}?confirmee=1`, { replace: true });
        },
        onError: (raw) => {
          const error = RpcError.from(raw);
          const target = ERROR_STEP[error.code];
          if (target === 2) dispatch({ type: 'setHold', hold: null });
          if (target) setParams({ produit: productSlug, etape: String(target) });
          setNotice(error.message);
          window.scrollTo({ top: 0 });
        },
      },
    );
  };

  const holdBanner =
    state.hold && step >= 3 ? (
      expired ? (
        <Alert tone="error" title="Le créneau n'est plus bloqué pour vous">
          <div className="flex flex-col items-start gap-3 pt-1">
            <span>Le délai de 10 minutes est écoulé. Bloquez-le à nouveau pour terminer la réservation.</span>
            <Button size="sm" onClick={holdSlots} disabled={holding}>
              {holding ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RotateCcw aria-hidden className="size-4" />}
              Bloquer à nouveau
            </Button>
          </div>
        </Alert>
      ) : (
        <HoldTimer remainingMs={remainingMs} />
      )
    ) : null;

  const passengersCount = state.passengers.filter(Boolean).length;

  return (
    <>
      <PageTop step={step} onNavigate={goTo} />
      <Container className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {notice && (
            <Alert tone="error" title="Réservation impossible en l'état">
              {notice}
            </Alert>
          )}
          {holdBanner}

          {step === 2 && (
            <>
              <CountStepper
                label={vehicle.seats > 1 ? 'Nombre de karts biplaces' : 'Nombre de pilotes'}
                hint={vehicle.seats > 1 ? `1 pilote + 1 passager facultatif par kart` : `Un kart par pilote, ${maxKarts} maximum en ligne`}
                value={state.karts}
                max={maxKarts}
                onChange={(karts) => dispatch({ type: 'setKarts', karts })}
              />
              <SlotPicker
                productId={product.id}
                karts={state.karts}
                horizonDays={Number(bundle.settings.booking_horizon_days ?? 90)}
                day={state.day}
                selected={state.slots}
                required={required}
                minGapMin={product.pack?.min_gap_min ?? 0}
                onSelectDay={(d) => dispatch({ type: 'selectDay', day: d })}
                onToggleSlot={(slot, d) => dispatch({ type: 'toggleSlot', slot, max: required, day: d })}
              />
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={() => goTo(1)}>
                  Changer d'activité
                </Button>
                <Button size="lg" onClick={continueFromSlots} disabled={state.slots.length !== required || holding}>
                  {holding && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  {state.slots.length === required ? 'Continuer' : required > 1 ? `Choisissez ${required} sessions` : 'Choisissez un créneau'}
                  {!holding && state.slots.length === required && <ArrowRight aria-hidden className="size-4" />}
                </Button>
              </div>
            </>
          )}

          {step === 3 && day && (
            <ParticipantsStep
              state={state}
              dispatch={dispatch}
              day={day}
              seats={vehicle.seats}
              rules={rules}
              requiresChrono={product.requires_chrono_validation}
              disabled={expired}
              onBack={() => goTo(2)}
              onContinue={() => goTo(4)}
            />
          )}

          {step === 4 && (
            <ConfirmStep
              state={state}
              dispatch={dispatch}
              product={product}
              settings={bundle.settings}
              giftAppliedCents={giftAppliedCents}
              onGiftApplied={setGiftAppliedCents}
              onEdit={goTo}
              onConfirm={confirmBooking}
              pending={confirm.isPending}
              disabled={expired}
            />
          )}
        </div>

        <BookingSummary
          product={product}
          karts={state.karts}
          seats={vehicle.seats}
          slots={state.slots}
          passengers={passengersCount}
          giftAppliedCents={step === 4 ? giftAppliedCents : 0}
          footer={
            <p className="text-xs text-asphalt-400">
              Groupe, anniversaire ?{' '}
              <Link to="/formules" className="text-race-400 underline underline-offset-2">
                Voir les formules
              </Link>
            </p>
          }
        />
      </Container>
    </>
  );
}
