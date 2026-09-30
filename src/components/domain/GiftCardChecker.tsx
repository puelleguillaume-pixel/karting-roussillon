import { ArrowRight, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/fields';
import { errorMessage } from '@/lib/data/errors';
import { formatDay, formatPrice, isoToParisDay } from '@/lib/format';
import { normalizeGiftCode } from '@/lib/giftcards';
import { useCheckGiftCard } from '@/lib/queries';

/**
 * Vérification du solde d'un bon. `initialCode` : code lu dans l'URL
 * (QR code imprimé sur le bon) ; il est vérifié dès l'affichage.
 */
export function GiftCardChecker({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(() => normalizeGiftCode(initialCode ?? '') ?? initialCode ?? '');
  const [formatError, setFormatError] = useState<string | undefined>();
  const check = useCheckGiftCard();
  const { mutate } = check;
  const containerRef = useRef<HTMLDivElement>(null);
  const checkedFromUrl = useRef(false);

  useEffect(() => {
    if (!initialCode || checkedFromUrl.current) return;
    checkedFromUrl.current = true;
    const normalized = normalizeGiftCode(initialCode);
    if (normalized) mutate(normalized);
    containerRef.current?.scrollIntoView({ block: 'center' });
  }, [initialCode, mutate]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeGiftCode(code);
    if (!normalized) {
      setFormatError('Le code comporte 12 caractères après « KDO », par exemple KDO-AB2C-DE3F-GH4J.');
      return;
    }
    setFormatError(undefined);
    setCode(normalized);
    mutate(normalized);
  };

  const result = check.data;
  const expiry = result ? formatDay(isoToParisDay(result.expires_at), { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div ref={containerRef} className="flex flex-col gap-5">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label="Code du bon"
          name="gift_code"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="KDO-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={formatError}
          className="flex-1 [&_input]:font-display [&_input]:text-lg [&_input]:uppercase [&_input]:tracking-[0.06em]"
        />
        <Button type="submit" size="lg" disabled={check.isPending} className="sm:mt-7">
          <Search aria-hidden className="size-4" />
          {check.isPending ? 'Vérification…' : 'Vérifier'}
        </Button>
      </form>

      {check.isError && <Alert tone="error" title="Vérification impossible">{errorMessage(check.error)}</Alert>}

      {result && (
        <div aria-live="polite" className="flex flex-col gap-4">
          {result.status === 'active' && (
            <>
              <Alert tone="success" title={`Solde disponible : ${formatPrice(result.balance_cents)}`}>
                {result.product ? `Valable pour : ${result.product.name}. ` : ''}
                Utilisable jusqu'au {expiry}, en une ou plusieurs fois.
              </Alert>
              <ButtonLink to={`/reserver?${new URLSearchParams({ ...(result.product ? { produit: result.product.slug } : {}), bon: check.variables ?? code })}`} className="self-start">
                Réserver avec ce bon
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </>
          )}
          {result.status === 'exhausted' && <Alert tone="info" title="Bon entièrement utilisé">Ce bon cadeau n'a plus de solde disponible.</Alert>}
          {result.status === 'expired' && <Alert tone="error" title="Bon expiré">Ce bon cadeau a expiré le {expiry}.</Alert>}
        </div>
      )}
    </div>
  );
}
