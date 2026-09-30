import { LoaderCircle, Mail, Paperclip } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { emailQrData, renderEmail, type EmailContext } from '../../supabase/functions/_shared/email/render.ts';
import { PageHeader } from '@/components/domain/blocks';
import { Seo } from '@/components/Seo';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Section } from '@/components/ui/layout';
import { useDemoOutbox } from '@/lib/booking-queries';
import { contactContent } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import type { OutboxEmail } from '@/lib/data/types';
import { env } from '@/lib/env';
import { downloadGiftCardPdf } from '@/lib/giftcard-pdf';
import { useBundle } from '@/lib/queries';
import NotFoundPage from './NotFoundPage';

interface GiftPayload {
  code: string;
  kind: 'amount' | 'product';
  amount_cents: number;
  product?: string | null;
  recipient_name?: string | null;
  buyer_first_name?: string | null;
  message?: string | null;
  expires_at?: string | null;
}

/** Mode démo : emails qui seraient envoyés, rendus avec les mêmes gabarits que l'Edge Function. */
export default function DemoInboxPage() {
  if (env.dataSource !== 'demo') return <NotFoundPage />;
  return <Inbox />;
}

function Inbox() {
  const bundle = useBundle();
  const outbox = useDemoOutbox(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const contact = contactContent(bundle);

  const ctx = useMemo<EmailContext>(
    () => ({
      siteUrl: window.location.origin,
      business: {
        name: contact?.title ?? 'Karting Roussillon',
        address: contact?.data.address ?? '',
        postalCode: contact?.data.postal_code ?? '',
        city: contact?.data.city ?? '',
        phone: contact?.data.phone ?? '',
        phoneE164: contact?.data.phone_e164 ?? '',
      },
      policy: {
        fullRefundHours: bundle.settings.cancel_full_refund_hours,
        creditHours: bundle.settings.cancel_credit_hours,
        giftCardValidityMonths: bundle.settings.gift_card_validity_months,
      },
    }),
    [bundle.settings, contact],
  );

  const emails = outbox.data ?? [];
  const selected = emails.find((e) => e.id === selectedId) ?? emails[0] ?? null;

  return (
    <>
      <Seo title="Emails de démonstration · Karting Roussillon" noIndex />
      <PageHeader
        eyebrow="Mode démonstration"
        title="Emails envoyés"
        intro="Chaque action (réservation, annulation, demande…) met un email en file d'envoi. En production, l'Edge Function les envoie via Gmail ; ici, ils s'affichent tels qu'ils seraient reçus."
      />
      <Section>
        {outbox.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : emails.length === 0 ? (
          <EmptyState title="Aucun email pour l'instant">Faites une réservation ou une demande : l'email apparaîtra ici.</EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto" aria-label="Emails">
              {emails.map((email) => {
                const rendered = renderEmail(email.template, email.payload, ctx);
                const isSelected = selected?.id === email.id;
                return (
                  <li key={email.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(email.id)}
                      className={cx(
                        'flex w-full flex-col gap-1 p-3 text-left ring-1 transition-colors',
                        isSelected ? 'bg-asphalt-800 ring-race-500' : 'bg-asphalt-900 ring-asphalt-800 hover:ring-asphalt-600',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-asphalt-400">
                        <span className="truncate">{email.to_email}</span>
                        {email.template.startsWith('owner_') && <Chip tone="yellow">Dirigeant</Chip>}
                      </span>
                      <span className="line-clamp-2 text-sm font-semibold text-chalk">{rendered?.subject ?? email.template}</span>
                      <span className="text-xs text-asphalt-400">{new Date(email.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selected && <EmailPreview email={selected} ctx={ctx} />}
          </div>
        )}
      </Section>
    </>
  );
}

function EmailPreview({ email, ctx }: { email: OutboxEmail; ctx: EmailContext }) {
  const qrData = emailQrData(email.template, email.payload, ctx.siteUrl);
  const [qr, setQr] = useState<{ data: string; src: string } | null>(null);

  useEffect(() => {
    if (!qrData) return;
    let active = true;
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(qrData, { width: 360, margin: 1 }))
      .then((src) => {
        if (active) setQr({ data: qrData, src });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [qrData]);

  const qrSrc = qrData && qr?.data === qrData ? qr.src : undefined;
  const rendered = renderEmail(email.template, email.payload, { ...ctx, qrSrc });
  const [downloading, setDownloading] = useState(false);
  if (!rendered) return <EmptyState title="Modèle inconnu">{email.template}</EmptyState>;

  // Même pièce jointe que l'Edge Function : le bon cadeau en PDF
  const gift = email.template === 'gift_card_issued' ? (email.payload as GiftPayload) : null;
  const downloadAttachment = async () => {
    if (!gift) return;
    setDownloading(true);
    try {
      await downloadGiftCardPdf(
        {
          code: gift.code,
          kind: gift.kind,
          amountCents: gift.amount_cents,
          productName: gift.product,
          recipientName: gift.recipient_name,
          fromName: gift.buyer_first_name,
          message: gift.message,
          expiresAt: gift.expires_at,
        },
        ctx.business,
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1 bg-asphalt-900 p-4 ring-1 ring-asphalt-800">
        <p className="flex items-center gap-2 text-sm text-asphalt-400">
          <Mail aria-hidden className="size-4" />À : {email.to_email}
        </p>
        <p className="font-semibold text-chalk">{rendered.subject}</p>
        {gift && (
          <button
            type="button"
            onClick={downloadAttachment}
            disabled={downloading}
            className="mt-2 inline-flex items-center gap-2 self-start bg-asphalt-800 px-3 py-2 text-sm font-semibold text-chalk ring-1 ring-asphalt-600 hover:ring-race-400"
          >
            {downloading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Paperclip aria-hidden className="size-4" />}
            bon-cadeau-{gift.code}.pdf
          </button>
        )}
      </div>
      <iframe title={`Aperçu : ${rendered.subject}`} srcDoc={rendered.html} sandbox="" className="h-[70vh] w-full bg-white" />
    </div>
  );
}
