// =============================================================================
// Edge Function `send-emails`
// Envoie les emails en file (public.email_outbox) via la Web App Google Apps
// Script (Gmail). Déclenchée chaque minute par pg_cron + pg_net quand des
// emails sont en attente (migration 13) ; peut aussi être appelée à la main.
//
// Secrets (supabase secrets set …) :
//   EMAIL_DISPATCH_SECRET  secret attendu dans l'en-tête x-dispatch-secret
//   APPS_SCRIPT_URL        URL /exec de la Web App Apps Script
//   APPS_SCRIPT_SECRET     secret partagé avec la Web App (propriété SHARED_SECRET)
//   SITE_URL               URL publique du site (liens et QR codes)
//   EMAIL_REPLY_TO         adresse de réponse (facultatif)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
// =============================================================================
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import QRCode from 'npm:qrcode@1.5.4';
import { emailQrData, renderEmail, type EmailContext } from '../_shared/email/render.ts';
import { buildGiftCardPdf, giftCardFileName } from '../_shared/giftcard/pdf.ts';

const BATCH_SIZE = 20;
const env = (name: string) => Deno.env.get(name)?.trim() || undefined;

interface OutboxRow {
  id: string;
  template: string;
  to_email: string;
  payload: unknown;
}

/** Comparaison à temps constant (évite de deviner le secret par mesure de durée). */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function loadContext(db: SupabaseClient, siteUrl: string): Promise<EmailContext> {
  const [{ data: contact, error: contactError }, { data: settings }] = await Promise.all([
    db.from('site_content').select('title, data').eq('key', 'contact').single(),
    db.from('settings').select('key, value').in('key', ['cancel_full_refund_hours', 'cancel_credit_hours', 'gift_card_validity_months']),
  ]);
  if (contactError || !contact) throw new Error('Coordonnées du circuit introuvables (site_content.contact)');
  const setting = (key: string) => {
    const value = settings?.find((s) => s.key === key)?.value;
    return typeof value === 'number' ? value : undefined;
  };
  const data = contact.data as Record<string, string>;
  return {
    siteUrl,
    business: {
      name: contact.title,
      address: data.address ?? '',
      postalCode: data.postal_code ?? '',
      city: data.city ?? '',
      phone: data.phone ?? '',
      phoneE164: data.phone_e164 ?? '',
    },
    policy: {
      fullRefundHours: setting('cancel_full_refund_hours'),
      creditHours: setting('cancel_credit_hours'),
      giftCardValidityMonths: setting('gift_card_validity_months'),
    },
  };
}

interface GiftCardEmailPayload {
  code: string;
  kind: 'amount' | 'product';
  amount_cents: number;
  product?: string | null;
  recipient_name?: string | null;
  buyer_first_name?: string | null;
  message?: string | null;
  expires_at?: string | null;
}

/** Bon cadeau : PDF imprimable joint à l'email (même QR code que dans le corps). */
async function giftCardAttachment(payload: GiftCardEmailPayload, ctx: EmailContext, qrPng: Uint8Array) {
  const pdf = await buildGiftCardPdf({
    code: payload.code,
    kind: payload.kind,
    amountCents: payload.amount_cents,
    productName: payload.product,
    recipientName: payload.recipient_name,
    fromName: payload.buyer_first_name,
    message: payload.message,
    expiresAt: payload.expires_at,
    business: { ...ctx.business, siteUrl: ctx.siteUrl },
    qrPng,
  });
  return { base64: encodeBase64(pdf), mimeType: 'application/pdf', name: giftCardFileName(payload.code) };
}

async function sendOne(email: OutboxRow, ctx: EmailContext, appsScriptUrl: string, appsScriptSecret: string): Promise<void> {
  const qrData = emailQrData(email.template, email.payload, ctx.siteUrl);
  const rendered = renderEmail(email.template, email.payload, { ...ctx, qrSrc: qrData ? 'cid:qr' : undefined });
  if (!rendered) throw new Error(`Modèle inconnu : ${email.template}`);

  const qrPng = qrData ? await QRCode.toBuffer(qrData, { type: 'png', width: 360, margin: 1, errorCorrectionLevel: 'M' }) : null;
  const inlineImages = qrPng ? { qr: { base64: encodeBase64(qrPng), mimeType: 'image/png', name: 'qr.png' } } : undefined;
  const attachments =
    email.template === 'gift_card_issued' && qrPng
      ? [await giftCardAttachment(email.payload as GiftCardEmailPayload, ctx, new Uint8Array(qrPng))]
      : undefined;

  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({
      secret: appsScriptSecret,
      to: email.to_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      name: ctx.business.name,
      replyTo: env('EMAIL_REPLY_TO'),
      inlineImages,
      attachments,
    }),
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(result?.error ?? `Apps Script : HTTP ${response.status}`);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const dispatchSecret = env('EMAIL_DISPATCH_SECRET');
  if (!dispatchSecret || !safeEqual(request.headers.get('x-dispatch-secret') ?? '', dispatchSecret)) {
    return new Response('Forbidden', { status: 403 });
  }
  const appsScriptUrl = env('APPS_SCRIPT_URL');
  const appsScriptSecret = env('APPS_SCRIPT_SECRET');
  if (!appsScriptUrl || !appsScriptSecret) {
    return Response.json({ error: 'APPS_SCRIPT_URL et APPS_SCRIPT_SECRET sont requis' }, { status: 500 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: batch, error } = await db.rpc('email_claim_batch', { p_limit: BATCH_SIZE });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const emails = (batch ?? []) as OutboxRow[];
  if (emails.length === 0) return Response.json({ claimed: 0, sent: 0, failed: 0 });

  let ctx: EmailContext;
  try {
    ctx = await loadContext(db, (env('SITE_URL') ?? 'https://www.kartingroussillon.com').replace(/\/$/, ''));
  } catch (contextError) {
    // Remise en file de tout le lot (nouvel essai différé)
    const message = contextError instanceof Error ? contextError.message : String(contextError);
    await Promise.all(emails.map((email) => db.rpc('email_mark_result', { p_id: email.id, p_ok: false, p_error: message })));
    return Response.json({ error: message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  for (const email of emails) {
    try {
      await sendOne(email, ctx, appsScriptUrl, appsScriptSecret);
      await db.rpc('email_mark_result', { p_id: email.id, p_ok: true });
      sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      await db.rpc('email_mark_result', { p_id: email.id, p_ok: false, p_error: message });
      failed++;
    }
  }
  return Response.json({ claimed: emails.length, sent, failed });
});
