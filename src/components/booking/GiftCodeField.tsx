import { Check, Gift, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';
import { errorMessage } from '@/lib/data/errors';
import { formatDay, formatPrice, isoToParisDay } from '@/lib/format';
import { normalizeGiftCode } from '@/lib/giftcards';
import { useCheckGiftCard } from '@/lib/queries';

interface GiftCodeFieldProps {
  code: string;
  onCodeChange: (code: string) => void;
  totalCents: number;
  /** Produit réservé ; null pour un événement (seuls les bons « montant » s'appliquent). */
  productId: string | null;
  appliedCents: number;
  onApplied: (cents: number) => void;
}

/** Saisie et vérification d'un bon cadeau avant la confirmation. */
export function GiftCodeField({ code, onCodeChange, totalCents, productId, appliedCents, onApplied }: GiftCodeFieldProps) {
  const check = useCheckGiftCard();
  const [error, setError] = useState<string | undefined>();
  const autoApplied = useRef(false);

  const run = (normalized: string) =>
    check.mutate(normalized, {
      onSuccess: (result) => {
        if (result.status !== 'active' || result.balance_cents <= 0) {
          setError(result.status === 'expired' ? 'Ce bon cadeau a expiré.' : 'Ce bon cadeau a déjà été utilisé.');
          onApplied(0);
          return;
        }
        if (result.kind === 'product' && result.product?.id !== productId) {
          setError(`Ce bon est valable pour : ${result.product?.name ?? 'une autre activité'}.`);
          onApplied(0);
          return;
        }
        onCodeChange(normalized);
        onApplied(Math.min(result.balance_cents, totalCents));
      },
      onError: (raw) => {
        setError(errorMessage(raw));
        onApplied(0);
      },
    });

  const apply = () => {
    const normalized = normalizeGiftCode(code);
    if (!normalized) {
      setError('Le code comporte 12 caractères après « KDO ».');
      return;
    }
    setError(undefined);
    run(normalized);
  };

  // Code transmis par un lien (« Réserver avec ce bon ») : appliqué d'office
  useEffect(() => {
    if (autoApplied.current) return;
    autoApplied.current = true;
    const normalized = normalizeGiftCode(code);
    if (normalized && appliedCents === 0) run(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'affichage
  }, []);

  const balanceLeft = check.data && appliedCents > 0 ? check.data.balance_cents - appliedCents : 0;

  return (
    <section aria-labelledby="bon-title" className="flex flex-col gap-3 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
      <h2 id="bon-title" className="flex items-center gap-2 font-display text-lg font-bold uppercase">
        <Gift aria-hidden className="size-5 text-race-400" />
        Bon cadeau
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Code du bon"
          name="gift_code"
          autoComplete="off"
          spellCheck={false}
          placeholder="KDO-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => {
            onCodeChange(e.target.value);
            onApplied(0);
            setError(undefined);
          }}
          error={error}
          className="flex-1 [&_input]:uppercase"
        />
        <Button variant="secondary" onClick={apply} disabled={check.isPending || !code.trim()} className="sm:mt-7">
          {check.isPending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          Appliquer
        </Button>
      </div>
      {appliedCents > 0 && (
        <p role="status" className="text-sm text-flag-green">
          <strong className="font-semibold">{formatPrice(appliedCents)}</strong> seront réglés avec votre bon.
          {balanceLeft > 0 && check.data && (
            <span className="text-asphalt-300">
              {' '}
              Il restera {formatPrice(balanceLeft)} sur le bon, valable jusqu'au{' '}
              {formatDay(isoToParisDay(check.data.expires_at), { day: 'numeric', month: 'long', year: 'numeric' })}.
            </span>
          )}
        </p>
      )}
    </section>
  );
}
