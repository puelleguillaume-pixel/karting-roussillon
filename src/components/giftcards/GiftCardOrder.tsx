import { CircleCheck, Download, Gift, LoaderCircle, Mail, Phone, Store } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { useOrderGiftCard, useSimulateGiftCardPayment } from '@/lib/booking-queries';
import { contactContent, isInSeason } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import type { CustomerInput, GiftCardOrderResult, Product } from '@/lib/data/types';
import { env } from '@/lib/env';
import { formatDay, formatPrice, isoToParisDay } from '@/lib/format';
import { downloadGiftCardPdf } from '@/lib/giftcard-pdf';
import { useBundle, useCatalog } from '@/lib/queries';
import { GiftCardPreview } from './GiftCardPreview';
import { trackConversion } from '@/lib/analytics';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMPTY_BUYER: CustomerInput = { first_name: '', last_name: '', email: '', phone: '' };

function parseEuros(value: string): number | null {
  const normalized = value.replace(/\s|€/g, '').replace(',', '.');
  if (!normalized) return null;
  const euros = Number(normalized);
  return Number.isFinite(euros) ? Math.round(euros * 100) : null;
}

export function GiftCardOrder() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const contact = contactContent(bundle);
  const settings = bundle.settings;
  const presets = Array.isArray(settings.gift_card_presets) ? (settings.gift_card_presets as number[]) : [];
  const minCents = Number(settings.gift_card_min_cents ?? 1000);
  const maxCents = Number(settings.gift_card_max_cents ?? 50000);
  const validityMonths = Number(settings.gift_card_validity_months ?? 12);

  const giftable = [...catalog.sessions, ...catalog.packs].filter((p) => p.price_cents !== null && isInSeason(p));
  const [kind, setKind] = useState<'amount' | 'product'>('amount');
  const [amount, setAmount] = useState<number | null>(presets[2] ?? presets[0] ?? 5000);
  const [custom, setCustom] = useState('');
  const [productId, setProductId] = useState(giftable[0]?.id ?? '');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [deliverTo, setDeliverTo] = useState<'buyer' | 'recipient'>('buyer');
  const [message, setMessage] = useState('');
  const [buyer, setBuyer] = useState<CustomerInput>(EMPTY_BUYER);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GiftCardOrderResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const order = useOrderGiftCard();

  const product: Product | undefined = catalog.productBySlug.get(giftable.find((p) => p.id === productId)?.slug ?? '');
  const amountCents = kind === 'amount' ? (custom ? parseEuros(custom) : amount) : (product?.price_cents ?? null);
  const valueLabel = kind === 'product' && product ? product.name : amountCents ? formatPrice(amountCents) : '— €';
  const valueDetail = kind === 'product' && product?.price_cents ? `soit ${formatPrice(product.price_cents)}` : undefined;

  const validate = () => {
    const found: Record<string, string> = {};
    if (kind === 'amount' && (amountCents === null || amountCents < minCents || amountCents > maxCents)) {
      found.custom_amount = `Choisissez un montant entre ${formatPrice(minCents)} et ${formatPrice(maxCents)}.`;
    }
    if (kind === 'product' && !product) found.product_id = 'Choisissez une activité.';
    if (!recipientName.trim()) found.recipient_name = 'Indiquez le prénom du bénéficiaire.';
    if (deliverTo === 'recipient' && !EMAIL.test(recipientEmail.trim())) found.recipient_email = 'Indiquez l’email du bénéficiaire.';
    if (!buyer.first_name.trim()) found['buyer.first_name'] = 'Indiquez votre prénom.';
    if (!buyer.last_name.trim()) found['buyer.last_name'] = 'Indiquez votre nom.';
    if (!EMAIL.test(buyer.email.trim())) found['buyer.email'] = 'Indiquez une adresse email valide.';
    if (buyer.phone.replace(/\D/g, '').length < 10) found['buyer.phone'] = 'Indiquez un numéro de téléphone à 10 chiffres.';
    if (!terms) found.terms = 'Acceptez les conditions générales de vente pour continuer.';
    return found;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    order.mutate(
      {
        kind,
        amount_cents: kind === 'amount' ? (amountCents ?? undefined) : undefined,
        product_id: kind === 'product' ? productId : undefined,
        recipient_name: recipientName.trim(),
        recipient_email: recipientEmail.trim() || undefined,
        deliver_to: deliverTo,
        message: message.trim(),
        buyer: { first_name: buyer.first_name.trim(), last_name: buyer.last_name.trim(), email: buyer.email.trim(), phone: buyer.phone.trim() },
        accept_terms: true,
      },
      {
        onSuccess: (result) => {
          trackConversion('gift_card', { valueCents: result.amount_cents, transactionId: result.order_reference });
          setResult(result);
        },
      },
    );
  };

  const preview = (
    <GiftCardPreview
      businessName={contact?.title ?? 'Karting Roussillon'}
      valueLabel={valueLabel}
      valueDetail={valueDetail}
      recipientName={recipientName.trim()}
      fromName={buyer.first_name.trim()}
      message={message.trim()}
      validityMonths={validityMonths}
    />
  );

  if (result) {
    return (
      <OrderConfirmation
        result={result}
        buyerFirstName={buyer.first_name.trim()}
        recipientEmail={recipientEmail.trim()}
        preview={preview}
        onReset={() => {
          setResult(null);
          order.reset();
          setRecipientName('');
          setRecipientEmail('');
          setMessage('');
          setTerms(false);
        }}
      />
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
          <legend className="float-left mb-4 w-full font-display text-lg font-bold uppercase">Que voulez-vous offrir ?</legend>
          <div className="clear-left inline-flex self-start bg-asphalt-950 p-1 ring-1 ring-asphalt-800" role="group" aria-label="Type de bon">
            {(['amount', 'product'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={cx('px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide', kind === value ? 'bg-race-600 text-white' : 'text-asphalt-300 hover:text-chalk')}
              >
                {value === 'amount' ? 'Un montant' : 'Une activité'}
              </button>
            ))}
          </div>
          {kind === 'amount' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Montants proposés">
                {presets.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    aria-pressed={!custom && amount === cents}
                    onClick={() => {
                      setAmount(cents);
                      setCustom('');
                    }}
                    className={cx(
                      'min-w-20 px-4 py-3 font-display text-2xl font-bold tabular ring-1 transition-colors',
                      !custom && amount === cents ? 'bg-race-600 text-white ring-race-600' : 'bg-asphalt-950 ring-asphalt-700 hover:ring-race-400',
                    )}
                  >
                    {formatPrice(cents)}
                  </button>
                ))}
              </div>
              <TextField
                label="Autre montant (€)"
                name="custom_amount"
                inputMode="decimal"
                placeholder={`De ${minCents / 100} à ${maxCents / 100} €`}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                error={errors.custom_amount}
                className="max-w-xs"
              />
            </div>
          ) : (
            <SelectField label="Activité" name="product_id" required value={productId} onChange={(e) => setProductId(e.target.value)} error={errors.product_id}>
              {[
                { label: 'Sessions', items: giftable.filter((p) => p.kind === 'session') },
                { label: 'Packs KR', items: giftable.filter((p) => p.kind === 'pack') },
              ].map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatPrice(p.price_cents ?? 0)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-4 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
          <legend className="float-left mb-4 w-full font-display text-lg font-bold uppercase">Pour qui ?</legend>
          <div className="clear-left grid gap-4">
            <TextField label="Prénom du bénéficiaire" name="recipient_name" required maxLength={80} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} error={errors.recipient_name} />
            <TextAreaField
              label="Message imprimé sur le bon"
              name="message"
              rows={3}
              maxLength={300}
              hint={`${message.length}/300 caractères`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div role="radiogroup" aria-label="Envoi du bon" className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Envoi du bon</p>
              {(
                [
                  ['buyer', 'À moi : je l’imprime ou je le transfère'],
                  ['recipient', 'Directement au bénéficiaire, par email'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 text-sm text-asphalt-200">
                  <input type="radio" name="deliver_to" value={value} checked={deliverTo === value} onChange={() => setDeliverTo(value)} className="size-5 accent-race-600" />
                  {label}
                </label>
              ))}
            </div>
            {deliverTo === 'recipient' && (
              <TextField label="Email du bénéficiaire" name="recipient_email" type="email" required value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} error={errors.recipient_email} />
            )}
          </div>
        </fieldset>

        <fieldset className="bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
          <legend className="float-left mb-4 w-full font-display text-lg font-bold uppercase">Vos coordonnées</legend>
          <div className="clear-left grid gap-4 sm:grid-cols-2">
            <TextField label="Prénom" name="buyer.first_name" autoComplete="given-name" required value={buyer.first_name} onChange={(e) => setBuyer({ ...buyer, first_name: e.target.value })} error={errors['buyer.first_name']} />
            <TextField label="Nom" name="buyer.last_name" autoComplete="family-name" required value={buyer.last_name} onChange={(e) => setBuyer({ ...buyer, last_name: e.target.value })} error={errors['buyer.last_name']} />
            <TextField label="Email" name="buyer.email" type="email" autoComplete="email" required value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} error={errors['buyer.email']} />
            <TextField label="Téléphone" name="buyer.phone" type="tel" autoComplete="tel" required value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} error={errors['buyer.phone']} />
          </div>
        </fieldset>

        <Alert tone="info" title="Règlement au circuit">
          Le bon est activé et envoyé par email dès le règlement, à l’accueil ou par téléphone
          {contact ? ` au ${contact.data.phone}` : ''}. Il est valable {validityMonths} mois.
        </Alert>

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
        {order.isError && <Alert tone="error" title="Commande impossible">{errorMessage(order.error)}</Alert>}
        <Button type="submit" size="lg" disabled={order.isPending} className="self-start">
          {order.isPending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Gift aria-hidden className="size-4" />}
          Commander le bon{amountCents ? ` · ${formatPrice(amountCents)}` : ''}
        </Button>
      </form>

      <div className="flex flex-col gap-3 lg:sticky lg:top-28">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400">Aperçu</p>
        {preview}
      </div>
    </div>
  );
}

function OrderConfirmation({
  result,
  buyerFirstName,
  recipientEmail,
  preview,
  onReset,
}: {
  result: GiftCardOrderResult;
  buyerFirstName: string;
  recipientEmail: string;
  preview: ReactNode;
  onReset: () => void;
}) {
  const bundle = useBundle();
  const contact = contactContent(bundle);
  const simulate = useSimulateGiftCardPayment();
  const [downloading, setDownloading] = useState(false);
  const activated = simulate.data;

  const download = async () => {
    if (!activated || !contact) return;
    setDownloading(true);
    try {
      await downloadGiftCardPdf(
        {
          code: activated.code,
          kind: activated.kind,
          amountCents: activated.initial_amount_cents,
          productName: result.product,
          recipientName: activated.recipient_name,
          fromName: buyerFirstName,
          message: activated.message,
          expiresAt: activated.expires_at,
        },
        { name: contact.title, address: contact.data.address, postalCode: contact.data.postal_code, city: contact.data.city, phone: contact.data.phone },
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex flex-col gap-5 border-l-4 border-flag-green bg-asphalt-900 p-6">
        <CircleCheck aria-hidden className="size-8 text-flag-green" />
        <h3 className="text-display-md font-bold uppercase">Commande enregistrée</h3>
        <p className="text-asphalt-200">
          Référence <strong className="font-display text-xl tracking-[0.1em] text-chalk">{result.order_reference}</strong> · bon de{' '}
          <strong className="text-chalk">{result.product ?? formatPrice(result.amount_cents)}</strong> pour {result.recipient_name}.
        </p>
        <ul className="flex flex-col gap-3 text-asphalt-200">
          <li className="flex gap-3">
            <Store aria-hidden className="mt-0.5 size-5 shrink-0 text-race-400" />
            Réglez {formatPrice(result.amount_cents)} à l'accueil du circuit, en indiquant la référence.
          </li>
          {contact && (
            <li className="flex gap-3">
              <Phone aria-hidden className="mt-0.5 size-5 shrink-0 text-race-400" />
              <span>
                Ou par téléphone au{' '}
                <a href={`tel:${contact.data.phone_e164}`} className="font-semibold text-chalk underline underline-offset-2">
                  {contact.data.phone}
                </a>
                .
              </span>
            </li>
          )}
          <li className="flex gap-3">
            <Mail aria-hidden className="mt-0.5 size-5 shrink-0 text-race-400" />
            {result.deliver_to === 'recipient'
              ? `Dès le règlement, le bon est envoyé par email à ${recipientEmail || 'son bénéficiaire'} (et à vous en copie), en PDF.`
              : 'Dès le règlement, le bon vous est envoyé par email, en PDF avec son code unique.'}
          </li>
        </ul>

        {env.dataSource === 'demo' && (
          <div className="flex flex-col gap-3 border-t border-asphalt-700 pt-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-flag-blue">Démonstration</p>
            {activated ? (
              <>
                <p className="text-asphalt-200">
                  Bon activé : code <strong className="font-display text-lg tracking-[0.1em] text-chalk">{activated.code}</strong>, valable jusqu'au{' '}
                  {formatDay(isoToParisDay(activated.expires_at), { day: 'numeric', month: 'long', year: 'numeric' })}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={download} disabled={downloading}>
                    {downloading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
                    Télécharger le PDF
                  </Button>
                  <Link to="/demo/emails" className="inline-flex items-center px-2 font-semibold text-race-400 underline underline-offset-4">
                    Voir les emails envoyés
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-asphalt-300">Simulez l'encaissement fait par l'accueil : le bon s'active et part par email avec son PDF.</p>
                <Button variant="secondary" onClick={() => simulate.mutate(result.order_reference)} disabled={simulate.isPending} className="self-start">
                  {simulate.isPending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  Simuler le règlement à l'accueil
                </Button>
                {simulate.isError && <Alert tone="error">{errorMessage(simulate.error)}</Alert>}
              </>
            )}
          </div>
        )}

        <Button variant="ghost" onClick={onReset} className="self-start">
          Commander un autre bon
        </Button>
      </div>
      <div className="flex flex-col gap-3 lg:sticky lg:top-28">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400">Votre bon</p>
        {preview}
      </div>
    </div>
  );
}
