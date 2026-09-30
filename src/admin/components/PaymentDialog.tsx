import { useState } from 'react';
import { useRecordPayment } from '../api';
import { centsToEuros, COUNTER_METHODS, eurosToCents, PAYMENT_METHOD } from '../labels';
import { useToast } from '../toast-context';
import type { PaymentMethod } from '../types';
import { Input, Modal, Select, SmallButton } from '../ui';

/** Encaissement ou remboursement (réservation, demande ou bon) */
export function PaymentDialog({
  open,
  kind,
  defaultCents,
  target,
  title,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: 'payment' | 'refund';
  defaultCents: number;
  target: { booking_id?: string; request_id?: string; gift_card_id?: string };
  title: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {open && <PaymentForm kind={kind} defaultCents={defaultCents} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function PaymentForm({
  kind,
  defaultCents,
  target,
  onClose,
  onDone,
}: {
  kind: 'payment' | 'refund';
  defaultCents: number;
  target: { booking_id?: string; request_id?: string; gift_card_id?: string };
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const record = useRecordPayment();
  const [amount, setAmount] = useState(centsToEuros(defaultCents));
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [note, setNote] = useState('');
  const cents = eurosToCents(amount);
  const invalid = cents == null || cents <= 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        record.mutate(
          { ...target, amount_cents: cents, method, kind, note },
          {
            onSuccess: () => {
              toast.success(kind === 'refund' ? 'Remboursement enregistré.' : 'Encaissement enregistré.');
              onDone?.();
              onClose();
            },
            onError: toast.error,
          },
        )
      }}
    >
      <Input label="Montant" inputMode="decimal" suffix="€" value={amount} onChange={(e) => setAmount(e.target.value)} error={invalid ? 'Montant invalide.' : undefined} required />
      <Select label="Moyen de paiement" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
        {COUNTER_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD[m]}
          </option>
        ))}
      </Select>
      <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facultatif" maxLength={200} />
      <div className="flex justify-end gap-2">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={record.isPending} disabled={invalid}>
          {kind === 'refund' ? 'Enregistrer le remboursement' : 'Enregistrer l’encaissement'}
        </SmallButton>
      </div>
    </form>
  );
}

