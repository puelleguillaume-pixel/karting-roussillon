import { useState } from 'react';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { cx } from '@/lib/cx';
import { formatPrice, formatTime } from '@/lib/format';
import { useAdminAvailability, useAdminCatalog, useCreateBooking } from '../api';
import { useToast } from '../toast-context';
import { Check, Input, Modal, Segmented, Select, SmallButton, Textarea } from '../ui';
import { customerEmail, customerError, customerPayload, type CustomerChoice } from './customer-choice';
import { CustomerPicker } from './CustomerPicker';

export interface ManualBookingDefaults {
  day: string;
  productId?: string;
  slotId?: string;
}

/** Réservation saisie par l'équipe (téléphone, comptoir) : hors quota en ligne. */
export function ManualBookingDialog({
  open,
  defaults,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaults: ManualBookingDefaults;
  onClose: () => void;
  onCreated?: (bookingId: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} wide title="Nouvelle réservation">
      {open && <ManualBookingForm defaults={defaults} onClose={onClose} onCreated={onCreated} />}
    </Modal>
  );
}

function ManualBookingForm({ defaults, onClose, onCreated }: { defaults: ManualBookingDefaults; onClose: () => void; onCreated?: (id: string) => void }) {
  const toast = useToast();
  const catalog = useAdminCatalog();
  const create = useCreateBooking();
  const [productId, setProductId] = useState(defaults.productId ?? '');
  const [day, setDay] = useState(defaults.day);
  const [karts, setKarts] = useState(1);
  const [slotIds, setSlotIds] = useState<string[]>(defaults.slotId ? [defaults.slotId] : []);
  const [customer, setCustomer] = useState<CustomerChoice>(null);
  const [source, setSource] = useState<'phone' | 'counter'>('phone');
  const [note, setNote] = useState('');
  const [giftCode, setGiftCode] = useState('');
  const [notify, setNotify] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const products = (catalog.data?.products ?? []).filter((p) => p.is_active && (p.kind === 'session' || p.kind === 'pack') && p.vehicle_type_id);
  const product = products.find((p) => p.id === productId);
  const required = product?.pack?.sessions_count ?? 1;
  const slots = useAdminAvailability(productId || undefined, day, karts);
  const email = customerEmail(customer);
  const custError = customerError(customer);
  const slotError = slotIds.length !== required ? (required > 1 ? `Choisissez ${required} créneaux.` : 'Choisissez un créneau.') : undefined;

  const toggleSlot = (id: string) => {
    setSlotIds((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (required === 1) return [id];
      return current.length >= required ? current : [...current, id];
    });
  };

  const submit = () => {
    setSubmitted(true);
    if (!product || slotError || custError) return;
    create.mutate(
      {
        product_id: product.id,
        slot_ids: slotIds,
        karts,
        ...customerPayload(customer),
        participants: [],
        source,
        internal_note: note,
        gift_card_code: giftCode.trim() || null,
        notify_customer: notify && !!email,
      },
      {
        onSuccess: (booking) => {
          toast.success(`Réservation ${booking.reference} enregistrée.`);
          onCreated?.(booking.id);
          onClose();
        },
        onError: toast.error,
      },
    );
  };

  if (catalog.isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Select
          label="Activité"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setSlotIds([]);
          }}
          error={submitted && !product ? 'Choisissez une activité.' : undefined}
          required
        >
          <option value="">Choisir…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.price_cents != null ? `· ${formatPrice(p.price_cents)}` : ''}
            </option>
          ))}
        </Select>
        <Input
          label="Karts"
          type="number"
          min={1}
          max={40}
          value={karts}
          onChange={(e) => {
            setKarts(Math.max(1, Number(e.target.value) || 1));
          }}
        />
        <Input
          label="Date"
          type="date"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            setSlotIds([]);
          }}
        />
      </div>

      {product && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">
            {required > 1 ? `Créneaux (${slotIds.length}/${required})` : 'Créneau'}
          </legend>
          {slots.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : slots.isError ? (
            <Alert tone="error">{(slots.error as Error).message}</Alert>
          ) : slots.data.length === 0 ? (
            <p className="text-sm text-asphalt-400">Aucun créneau ce jour-là pour cette activité.</p>
          ) : (
            <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-6">
              {slots.data.map((s) => {
                const selected = slotIds.includes(s.slot_id);
                return (
                  <button
                    key={s.slot_id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!s.available && !selected}
                    onClick={() => toggleSlot(s.slot_id)}
                    title={s.blocked ? 'Plage bloquée' : undefined}
                    className={cx(
                      'flex flex-col items-center px-1 py-1.5 text-sm ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      selected ? 'bg-race-600 text-white ring-race-500' : 'bg-asphalt-950 text-chalk ring-asphalt-700 hover:ring-race-400',
                    )}
                  >
                    <span className="font-semibold tabular">{formatTime(s.starts_at)}</span>
                    <span className="text-[0.7rem] opacity-80">
                      {s.blocked ? 'bloqué' : `${s.remaining} libre${s.remaining > 1 ? 's' : ''}`} · {s.track_name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {submitted && slotError && <p className="text-xs font-medium text-race-400">{slotError}</p>}
          <p className="text-xs text-asphalt-400">Saisie équipe : toute la flotte est disponible (le quota en ligne ne s’applique pas). Âges et chevauchements restent contrôlés.</p>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Client</legend>
        <CustomerPicker value={customer} onChange={setCustomer} error={submitted ? custError : undefined} />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-asphalt-300">Origine</span>
          <Segmented
            label="Origine de la réservation"
            value={source}
            onChange={setSource}
            options={[
              { value: 'phone', label: 'Téléphone' },
              { value: 'counter', label: 'Comptoir' },
            ]}
          />
        </div>
        <Input label="Bon cadeau" value={giftCode} onChange={(e) => setGiftCode(e.target.value)} placeholder="KDO-XXXX-XXXX-XXXX" hint="Facultatif" />
      </div>
      <Textarea label="Note interne" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      <Check
        label={email ? `Envoyer la confirmation (QR code) à ${email}` : 'Pas d’email : aucune confirmation ne sera envoyée'}
        checked={notify && !!email}
        disabled={!email}
        onChange={(e) => setNotify(e.target.checked)}
      />
      {product?.price_cents != null && (
        <p className="text-sm text-asphalt-200">
          Total : <strong className="text-chalk">{formatPrice(product.price_cents * karts)}</strong> · réglé sur place
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={create.isPending}>
          Enregistrer la réservation
        </SmallButton>
      </div>
    </form>
  );
}
