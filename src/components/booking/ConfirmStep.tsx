import { ArrowLeft, Check, LoaderCircle } from 'lucide-react';
import { useState, type Dispatch, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextAreaField } from '@/components/ui/fields';
import { Markdown } from '@/components/ui/Markdown';
import { useWaiver } from '@/lib/booking-queries';
import type { Product, PublicSettings } from '@/lib/data/types';
import { capitalize, formatDay, formatTime, isoToParisDay } from '@/lib/format';
import type { FlowAction, FlowState } from './flow';
import { GiftCodeField } from './GiftCodeField';

interface ConfirmStepProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
  product: Product;
  settings: PublicSettings;
  giftAppliedCents: number;
  onGiftApplied: (cents: number) => void;
  onEdit: (step: number) => void;
  onConfirm: () => void;
  pending: boolean;
  disabled: boolean;
}

function Recap({ title, step, onEdit, children }: { title: string; step: number; onEdit: (step: number) => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-asphalt-800 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="text-sm font-semibold text-race-400 underline-offset-4 hover:underline">
          Modifier<span className="sr-only"> : {title.toLowerCase()}</span>
        </button>
      </div>
      <div className="text-chalk">{children}</div>
    </div>
  );
}

export function ConfirmStep({ state, dispatch, product, settings, giftAppliedCents, onGiftApplied, onEdit, onConfirm, pending, disabled }: ConfirmStepProps) {
  const waiver = useWaiver();
  const [terms, setTerms] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const total = (product.price_cents ?? 0) * state.karts;
  const passengers = state.passengers.filter(Boolean);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!terms) found.terms = 'Acceptez les conditions générales de vente pour continuer.';
    if (!waiverAccepted) found.waiver = 'Acceptez la décharge de responsabilité pour continuer.';
    setErrors(found);
    if (Object.keys(found).length === 0) onConfirm();
  };

  const full = settings.cancel_full_refund_hours;
  const credit = settings.cancel_credit_hours;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <section aria-labelledby="recap-title" className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
        <h2 id="recap-title" className="font-display text-lg font-bold uppercase">
          Vérifiez votre réservation
        </h2>
        <Recap title="Activité et créneau" step={2} onEdit={onEdit}>
          <p className="font-semibold">{product.name}</p>
          {state.slots[0] && <p>{capitalize(formatDay(isoToParisDay(state.slots[0].starts_at)))}</p>}
          {state.slots.map((slot) => (
            <p key={slot.slot_id} className="tabular text-asphalt-200">
              {formatTime(slot.starts_at)} · {slot.track_name}
            </p>
          ))}
        </Recap>
        <Recap title="Participants" step={3} onEdit={onEdit}>
          <ul>
            {state.drivers.map((d, i) => (
              <li key={`d${i}`}>
                {d.first_name} {d.last_name}
                <span className="text-asphalt-400"> · pilote</span>
              </li>
            ))}
            {passengers.map((p, i) => (
              <li key={`p${i}`}>
                {p?.first_name} {p?.last_name}
                <span className="text-asphalt-400"> · passager</span>
              </li>
            ))}
          </ul>
        </Recap>
        <Recap title="Contact" step={3} onEdit={onEdit}>
          <p>
            {state.contact.first_name} {state.contact.last_name}
          </p>
          <p className="text-asphalt-200">
            {state.contact.email} · {state.contact.phone}
          </p>
        </Recap>
      </section>

      <GiftCodeField
        code={state.giftCode}
        onCodeChange={(code) => dispatch({ type: 'setGiftCode', code })}
        totalCents={total}
        productId={product.id}
        appliedCents={giftAppliedCents}
        onApplied={onGiftApplied}
      />

      <TextAreaField
        label="Message pour le circuit"
        name="note"
        rows={3}
        maxLength={2000}
        placeholder="Une précision utile pour l'équipe ?"
        value={state.note}
        onChange={(e) => dispatch({ type: 'setNote', note: e.target.value })}
      />

      <section aria-labelledby="conditions-title" className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
        <h2 id="conditions-title" className="font-display text-lg font-bold uppercase">
          Conditions
        </h2>
        {full && credit && (
          <p className="text-sm text-asphalt-200">
            Report ou annulation sans frais jusqu'à {full} h avant le départ. Entre {full} h et {credit} h, l'annulation donne lieu à un avoir. En dessous
            de {credit} h, contactez le circuit.
          </p>
        )}
        {waiver.data && (
          <details className="group bg-asphalt-950 p-4 ring-1 ring-asphalt-800">
            <summary className="cursor-pointer font-semibold text-chalk">Lire la décharge de responsabilité</summary>
            <div className="mt-3 max-h-64 overflow-y-auto pr-2 text-sm">
              <p className="mb-2 font-semibold text-chalk">{waiver.data.title}</p>
              <Markdown source={waiver.data.body} className="text-sm" />
            </div>
          </details>
        )}
        <CheckboxField
          name="waiver"
          checked={waiverAccepted}
          onChange={(e) => setWaiverAccepted(e.target.checked)}
          error={errors.waiver}
          label="J'accepte la décharge de responsabilité, pour moi et pour les participants mineurs dont je suis le représentant légal ou dont le représentant légal est indiqué."
        />
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
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => onEdit(3)}>
          <ArrowLeft aria-hidden className="size-4" />
          Retour
        </Button>
        <Button type="submit" size="lg" disabled={pending || disabled}>
          {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          {pending ? 'Confirmation…' : 'Confirmer la réservation'}
        </Button>
      </div>
    </form>
  );
}
