import { ArrowLeft, ArrowRight, Timer, UserRoundPlus, X } from 'lucide-react';
import { useRef, useState, type Dispatch, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/fields';
import { useAuth } from '@/lib/auth-context';
import { EMPTY_PARTICIPANT } from '@/lib/booking-rules';
import { useMyProfile } from '@/lib/booking-queries';
import { participantErrors, type FlowAction, type FlowState, type StepRules } from './flow';
import { ParticipantFields } from './ParticipantFields';

interface ParticipantsStepProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  day: string;
  seats: number;
  rules: StepRules;
  requiresChrono: boolean;
  disabled: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function ParticipantsStep({ state, dispatch, day, seats, rules, requiresChrono, disabled, onBack, onContinue }: ParticipantsStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { user } = useAuth();
  const profile = useMyProfile();
  const contact = state.contact;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = participantErrors(state, rules);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    onContinue();
  };

  const contactError = (field: string) => errors[`contact.${field}`];

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
      <fieldset className="bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
        <legend className="float-left mb-4 flex w-full flex-wrap items-center justify-between gap-3">
          <span className="font-display text-lg font-bold uppercase">Vos coordonnées</span>
          {user && profile.data && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                dispatch({
                  type: 'setContact',
                  patch: {
                    first_name: profile.data?.first_name ?? '',
                    last_name: profile.data?.last_name ?? '',
                    email: profile.data?.email ?? user.email,
                    phone: profile.data?.phone ?? '',
                  },
                })
              }
            >
              Utiliser mon compte
            </Button>
          )}
        </legend>
        <div className="clear-left grid gap-4 sm:grid-cols-2">
          <TextField label="Prénom" name="contact.first_name" autoComplete="given-name" required value={contact.first_name} onChange={(e) => dispatch({ type: 'setContact', patch: { first_name: e.target.value } })} error={contactError('first_name')} />
          <TextField label="Nom" name="contact.last_name" autoComplete="family-name" required value={contact.last_name} onChange={(e) => dispatch({ type: 'setContact', patch: { last_name: e.target.value } })} error={contactError('last_name')} />
          <TextField
            label="Email"
            name="contact.email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            hint="La confirmation et le QR code d'accès y sont envoyés."
            value={contact.email}
            onChange={(e) => dispatch({ type: 'setContact', patch: { email: e.target.value } })}
            error={contactError('email')}
          />
          <TextField label="Téléphone" name="contact.phone" type="tel" inputMode="tel" autoComplete="tel" required value={contact.phone} onChange={(e) => dispatch({ type: 'setContact', patch: { phone: e.target.value } })} error={contactError('phone')} />
        </div>
      </fieldset>

      {requiresChrono && (
        <Alert tone="info" title="Validation chrono requise">
          Chaque pilote doit avoir été validé au chronomètre par l'équipe du circuit. Si ce n'est pas encore le cas, appelez-nous avant de réserver.
        </Alert>
      )}

      {state.drivers.map((driver, index) => {
        const passenger = state.passengers[index] ?? null;
        return (
          <div key={index} className="flex flex-col gap-3">
            <ParticipantFields
              name={`driver.${index}`}
              legend={seats > 1 ? `Kart ${index + 1} · pilote` : state.drivers.length > 1 ? `Pilote ${index + 1}` : 'Pilote'}
              value={driver}
              errors={errors}
              day={day}
              minHeight={rules.driver.minHeight}
              onChange={(patch) => dispatch({ type: 'setDriver', index, patch })}
              action={
                index === 0 && contact.first_name && contact.last_name ? (
                  <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'setDriver', index, patch: { first_name: contact.first_name, last_name: contact.last_name } })}>
                    C'est moi
                  </Button>
                ) : undefined
              }
            />
            {seats > 1 && rules.passenger && (
              passenger ? (
                <ParticipantFields
                  name={`passenger.${index}`}
                  legend={`Kart ${index + 1} · passager`}
                  value={passenger}
                  errors={errors}
                  day={day}
                  minHeight={rules.passenger.minHeight}
                  onChange={(patch) => dispatch({ type: 'setPassengerField', index, patch })}
                  action={
                    <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'setPassenger', index, draft: null })}>
                      <X aria-hidden className="size-4" />
                      Retirer
                    </Button>
                  }
                />
              ) : (
                <Button variant="secondary" size="sm" className="self-start" onClick={() => dispatch({ type: 'setPassenger', index, draft: { ...EMPTY_PARTICIPANT } })}>
                  <UserRoundPlus aria-hidden className="size-4" />
                  Ajouter un passager (dès {rules.passenger.minAge} ans)
                </Button>
              )
            )}
          </div>
        );
      })}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          Changer de créneau
        </Button>
        <Button type="submit" size="lg" disabled={disabled}>
          {disabled && <Timer aria-hidden className="size-4" />}
          Continuer
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </form>
  );
}
